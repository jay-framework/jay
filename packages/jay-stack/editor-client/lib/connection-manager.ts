import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import type {
    ConnectionState,
    ProtocolMessage,
    ProtocolResponse,
    PortDiscoveryResponse,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
} from '@jay-framework/editor-protocol';

export interface ConnectionManagerOptions {
    portRange?: [number, number];
    scanTimeout?: number;
    retryAttempts?: number;
    editorId?: string;
    autoReconnect?: boolean;
    reconnectDelay?: number;
    maxReconnectAttempts?: number;
}

export class ConnectionManager {
    private socket: Socket | null = null;
    private connectionState: ConnectionState = 'disconnected';
    private portRange: [number, number];
    private scanTimeout: number;
    private retryAttempts: number;
    private editorId: string;
    private autoReconnect: boolean;
    private reconnectDelay: number;
    private maxReconnectAttempts: number;
    private reconnectAttempts: number = 0;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isManualDisconnect: boolean = false;
    private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();

    constructor(options: ConnectionManagerOptions = {}) {
        this.portRange = options.portRange || [3101, 3200];
        this.scanTimeout = options.scanTimeout || 5000;
        this.retryAttempts = options.retryAttempts || 3;
        this.editorId = options.editorId || uuidv4();
        this.autoReconnect = options.autoReconnect ?? true;
        this.reconnectDelay = options.reconnectDelay ?? 1000;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
    }

    async connect(): Promise<void> {
        if (this.connectionState === 'connected') {
            return;
        }

        this.isManualDisconnect = false;
        this.reconnectAttempts = 0;
        this.connectionState = 'connecting';

        try {
            const serverPort = await this.discoverServer();
            await this.establishConnection(serverPort);
            this.connectionState = 'connected';
        } catch (error) {
            this.connectionState = 'error';
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.isManualDisconnect = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connectionState = 'disconnected';
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    async sendMessage<T extends PublishMessage | SaveImageMessage | HasImageMessage>(
        message: T,
    ): Promise<
        T extends PublishMessage
            ? PublishResponse
            : T extends SaveImageMessage
              ? SaveImageResponse
              : T extends HasImageMessage
                ? HasImageResponse
                : never
    > {
        if (this.connectionState !== 'connected') {
            throw new Error('Not connected to editor server');
        }

        if (!this.socket) {
            throw new Error('Not connected to editor server - Socket not available');
        }

        return new Promise((resolve, reject) => {
            const messageId = uuidv4();
            const protocolMessage: ProtocolMessage = {
                id: messageId,
                timestamp: Date.now(),
                payload: message,
            };

            this.pendingRequests.set(messageId, { resolve, reject });

            // Set timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(messageId)) {
                    this.pendingRequests.delete(messageId);
                    reject(new Error('Request timeout'));
                }
            }, this.scanTimeout);

            this.socket!.emit('protocol-message', protocolMessage);
        }) as any;
    }

    onConnectionStateChange(callback: (state: ConnectionState) => void): void {
        // This would need to be implemented with a proper event system
        // For now, we'll use polling
        const checkState = () => {
            const currentState = this.getConnectionState();
            callback(currentState);

            if (currentState === 'disconnected' && this.autoReconnect && !this.isManualDisconnect) {
                this.attemptReconnect();
            }
        };

        // Check state every second
        setInterval(checkState, 1000);
    }

    private async discoverServer(): Promise<number> {
        const [startPort, endPort] = this.portRange;
        const ports = Array.from({ length: endPort - startPort + 1 }, (_, i) => startPort + i);

        for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
            for (const port of ports) {
                try {
                    const response = await this.checkPort(port);
                    if (response) {
                        return port;
                    }
                } catch (error) {
                    // Continue to next port
                }
            }

            if (attempt < this.retryAttempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        throw new Error(`No editor server found in port range ${startPort}-${endPort}`);
    }

    private async checkPort(port: number): Promise<PortDiscoveryResponse | null> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Port ${port} timeout`));
            }, this.scanTimeout);

            const controller = new AbortController();

            fetch(`http://localhost:${port}/editor-connect?id=${this.editorId}`, {
                signal: controller.signal,
            })
                .then((response) => {
                    clearTimeout(timeout);
                    if (response.ok) {
                        return response.json();
                    }
                    throw new Error(`HTTP ${response.status}`);
                })
                .then((data: PortDiscoveryResponse) => {
                    // Accept if server is in init mode or if IDs match
                    if (data.status === 'init' || data.id === this.editorId) {
                        resolve(data);
                    } else {
                        resolve(null);
                    }
                })
                .catch((error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }

    private async establishConnection(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = io(`http://localhost:${port}`, {
                timeout: this.scanTimeout,
                forceNew: true,
            });

            this.socket.on('connect', () => {
                console.log('Connected to editor server');
                this.setupSocketHandlers();
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                reject(error);
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from editor server');
                this.connectionState = 'disconnected';
            });
        });
    }

    private setupSocketHandlers(): void {
        if (!this.socket) return;

        this.socket.on('protocol-response', (response: ProtocolResponse) => {
            const pendingRequest = this.pendingRequests.get(response.id);
            if (pendingRequest) {
                this.pendingRequests.delete(response.id);
                if (response.payload.success) {
                    pendingRequest.resolve(response.payload);
                } else {
                    pendingRequest.reject(new Error(response.payload.error || 'Unknown error'));
                }
            }
        });
    }

    private async attemptReconnect(): Promise<void> {
        if (this.isManualDisconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }

        this.reconnectAttempts++;
        console.log(
            `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
        );

        try {
            await this.connect();
            this.reconnectAttempts = 0; // Reset on successful connection
            console.log('Reconnected successfully');
        } catch (error) {
            console.error('Reconnection failed:', error);

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectTimer = setTimeout(() => {
                    this.attemptReconnect();
                }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
            } else {
                console.error('Max reconnection attempts reached');
            }
        }
    }
}

export function createConnectionManager(options?: ConnectionManagerOptions): ConnectionManager {
    return new ConnectionManager(options);
}
