import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import type {
    ConnectionState,
    ProtocolResponse,
    PortDiscoveryResponse,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
} from '@jay-framework/editor-protocol';
import { createProtocolMessage } from '@jay-framework/editor-protocol';

export interface ConnectionManagerOptions {
    portRange?: [number, number];
    scanTimeout?: number;
    retryAttempts?: number;
    editorId?: string;
    autoReconnect?: boolean;
    reconnectDelay?: number;
}

export type ConnectionStateCallback = (state: ConnectionState) => void;

export class ConnectionManager {
    private socket: Socket | null = null;
    private connectionState: ConnectionState = 'disconnected';
    private portRange: [number, number];
    private scanTimeout: number;
    private retryAttempts: number;
    private editorId: string;
    private autoReconnect: boolean;
    private reconnectDelay: number;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isManualDisconnect: boolean = false;
    private isConnecting: boolean = false;
    private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
    private stateChangeCallbacks: Set<ConnectionStateCallback> = new Set();

    constructor(options: ConnectionManagerOptions = {}) {
        this.portRange = options.portRange || [3101, 3200];
        this.scanTimeout = options.scanTimeout || 5000;
        this.retryAttempts = options.retryAttempts || 3;
        this.editorId = options.editorId || uuidv4();
        this.autoReconnect = options.autoReconnect || true;
        this.reconnectDelay = options.reconnectDelay || 1000;
    }

    async connect(): Promise<void> {
        if (this.connectionState === 'connected' || this.isConnecting) {
            return;
        }

        this.isManualDisconnect = false;
        this.isConnecting = true;
        this.updateConnectionState('connecting');

        try {
            const serverPort = await this.discoverServer();
            await this.establishConnection(serverPort);
            this.updateConnectionState('connected');
        } catch (error) {
            this.updateConnectionState('error');
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    async disconnect(): Promise<void> {
        this.isManualDisconnect = true;
        this.isConnecting = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.updateConnectionState('disconnected');
    }

    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    onConnectionStateChange(callback: ConnectionStateCallback): () => void {
        this.stateChangeCallbacks.add(callback);

        // Return unsubscribe function
        return () => {
            this.stateChangeCallbacks.delete(callback);
        };
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
            const protocolMessage = createProtocolMessage(message);

            this.pendingRequests.set(protocolMessage.id, { resolve, reject });

            // Set timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(protocolMessage.id)) {
                    this.pendingRequests.delete(protocolMessage.id);
                    reject(new Error('Request timeout'));
                }
            }, this.scanTimeout);

            this.socket!.emit('protocol-message', protocolMessage);
        }) as any;
    }

    private updateConnectionState(newState: ConnectionState): void {
        if (this.connectionState !== newState) {
            const oldState = this.connectionState;
            this.connectionState = newState;

            // Notify all callbacks
            this.stateChangeCallbacks.forEach((callback) => {
                try {
                    callback(newState);
                } catch (error) {
                    console.error('Error in connection state callback:', error);
                }
            });

            // Handle automatic reconnection
            if (newState === 'disconnected' && this.autoReconnect && !this.isManualDisconnect) {
                this.scheduleReconnect();
            }
        }
    }

    private scheduleReconnect(): void {
        if (this.isManualDisconnect || this.reconnectTimer) {
            return;
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.attemptReconnect();
        }, this.reconnectDelay);
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
                this.updateConnectionState('disconnected');
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
        if (this.isManualDisconnect || this.isConnecting) {
            return;
        }

        console.log('Attempting to reconnect...');

        try {
            await this.connect();
            console.log('Reconnected successfully');
        } catch (error) {
            console.error('Reconnection failed:', error);
            // Schedule next reconnection attempt
            this.scheduleReconnect();
        }
    }
}

export function createConnectionManager(options?: ConnectionManagerOptions): ConnectionManager {
    return new ConnectionManager(options);
}
