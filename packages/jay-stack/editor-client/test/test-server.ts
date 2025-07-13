import { createServer, Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { AddressInfo } from 'net';
import { Socket } from 'socket.io';
import { createProtocolResponse } from '@jay-framework/editor-protocol';

export interface TestServerOptions {
    port?: number;
    editorId?: string;
}

export interface TestServerResponse {
    port: number;
    server: any;
    socketServer: SocketIOServer;
    close: () => Promise<void>;
}

export class TestServer {
    private httpServer: Server;
    private socketServer: SocketIOServer | null = null;
    private port: number;
    private editorId?: string;
    private protocolHandlers: Map<string, (params: any) => Promise<any>> = new Map();
    private connectedSockets: Set<Socket<any>> = new Set();

    constructor(options: TestServerOptions = {}) {
        this.port = options.port || 0; // 0 means let the OS assign a port
        this.editorId = options.editorId ;
    }

    async start(): Promise<TestServerResponse> {
        return new Promise((resolve, reject) => {
            this.httpServer = createServer((req, res) => {
                this.handleHttpRequest(req, res);
            });

            this.socketServer = new SocketIOServer(this.httpServer, {
                cors: {
                    origin: '*',
                    methods: ['GET', 'POST'],
                },
            });

            this.setupSocketHandlers();

            this.httpServer.listen(this.port, () => {
                const address = this.httpServer.address() as AddressInfo;
                this.port = address.port;

                resolve({
                    port: this.port,
                    server: this.httpServer,
                    socketServer: this.socketServer!,
                    close: () => this.close(),
                });
            });

            this.httpServer.on('error', reject);
        });
    }

    async close(): Promise<void> {
        return new Promise((resolve) => {
            // Disconnect all connected sockets first
            for (const socket of this.connectedSockets) {
                socket.disconnect(true);
            }
            this.connectedSockets.clear();

            // Close Socket.io server with a timeout
            if (this.socketServer) {
                this.httpServer.closeAllConnections();
                this.httpServer.closeIdleConnections();
                this.socketServer.close(() => {
                    // Close HTTP server after Socket.io is closed
                    if (this.httpServer) {
                        this.httpServer.close(() => resolve());
                    } else {
                        resolve();
                    }
                });
            } else if (this.httpServer) {
                this.httpServer.closeAllConnections();
                this.httpServer.closeIdleConnections();
                this.httpServer.close(() => resolve());
            } else {
                resolve();
            }
        });
    }

    // Register protocol handlers for testing
    onPublish(handler: (params: any) => Promise<any>): void {
        this.protocolHandlers.set('publish', handler);
    }

    onSaveImage(handler: (params: any) => Promise<any>): void {
        this.protocolHandlers.set('saveImage', handler);
    }

    onHasImage(handler: (params: any) => Promise<any>): void {
        this.protocolHandlers.set('hasImage', handler);
    }

    private handleHttpRequest(req: any, res: any): void {
        if (req.url?.startsWith('/editor-connect')) {
            this.handlePortDiscovery(req, res);
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    }

    private handlePortDiscovery(req: any, res: any): void {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const tabId = url.searchParams.get('id');

        if (!tabId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing tab ID' }));
            return;
        }

        // In configured mode, only respond if IDs match
        const response = {
            status: !this.editorId? 'init':
                this.editorId === tabId ? 'match' : 'no-match',
            id: this.editorId,
            port: this.port,
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    }

    private setupSocketHandlers(): void {
        if (!this.socketServer) return;

        this.socketServer.on('connection', (socket) => {
            console.log(`Test server: Editor connected: ${socket.id}`, new Date().getTime());
            this.connectedSockets.add(socket);

            socket.on('protocol-message', async (message) => {
                try {
                    const response = await this.handleProtocolMessage(message);
                    socket.emit('protocol-response', response);
                } catch (error) {
                    const errorPayload = {
                        type: message.payload.type,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    };
                    const errorResponse = createProtocolResponse(message.id, errorPayload);
                    socket.emit('protocol-response', errorResponse);
                }
            });

            socket.on('disconnect', () => {
                console.log(`Test server: Editor disconnected: ${socket.id}`, new Date().getTime());
                this.connectedSockets.delete(socket);
            });
        });
    }

    private async handleProtocolMessage(message: any): Promise<any> {
        const { id, payload } = message;
        const handler = this.protocolHandlers.get(payload.type);

        if (!handler) {
            throw new Error(`No handler registered for message type: ${payload.type}`);
        }

        const result = await handler(payload);

        const responsePayload = {
            type: payload.type,
            success: true,
            ...result,
        };

        return createProtocolResponse(id, responsePayload);
    }
}

export function createTestServer(options?: TestServerOptions): TestServer {
    return new TestServer(options);
}
