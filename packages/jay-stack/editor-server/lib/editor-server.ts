import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import getPort from 'get-port';
import type {
    DevServerProtocol,
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
import { createProtocolResponse } from '@jay-framework/editor-protocol';

export interface EditorServerOptions {
    editorId?: string;
    onEditorId?: (editorId: string) => void;
    portRange?: [number, number];
}

export class EditorServer implements DevServerProtocol {
    private io: SocketIOServer | null = null;
    private httpServer: any = null;
    private port: number | null = null;
    private editorId: string | null = null;
    private portRange: [number, number];
    private onEditorId: (editorId: string) => void;
    private handlers: {
        publish?: (params: PublishMessage) => Promise<PublishResponse>;
        saveImage?: (params: SaveImageMessage) => Promise<SaveImageResponse>;
        hasImage?: (params: HasImageMessage) => Promise<HasImageResponse>;
    } = {};

    constructor(options: EditorServerOptions) {
        this.portRange = options.portRange || [3101, 3200];
        this.onEditorId = options.onEditorId;
        this.editorId = options.editorId || null;
    }

    async start(): Promise<{ port: number; editorId: string }> {
        // Find available port
        this.port = await getPort({ port: this.portRange });

        // Create HTTP server for port discovery
        this.httpServer = createServer((req, res) => {
            if (req.url?.startsWith('/editor-connect')) {
                this.handlePortDiscovery(req, res);
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        // Create Socket.io server
        this.io = new SocketIOServer(this.httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });

        // Setup Socket.io event handlers
        this.setupSocketHandlers();

        // Start server
        return new Promise((resolve, reject) => {
            this.httpServer!.listen(this.port, () => {
                console.log(`Editor server started on port ${this.port}`);
                resolve({ port: this.port!, editorId: this.editorId || 'init' });
            });

            this.httpServer!.on('error', reject);
        });
    }

    async stop(): Promise<void> {
        if (this.io) {
            this.io.close();
        }
        if (this.httpServer) {
            this.httpServer.close();
        }
    }

    // DevServerProtocol implementation
    onPublish(callback: (params: PublishMessage) => Promise<PublishResponse>): void {
        this.handlers.publish = callback;
    }

    onSaveImage(callback: (params: SaveImageMessage) => Promise<SaveImageResponse>): void {
        this.handlers.saveImage = callback;
    }

    onHasImage(callback: (params: HasImageMessage) => Promise<HasImageResponse>): void {
        this.handlers.hasImage = callback;
    }

    private handlePortDiscovery(req: any, res: any): void {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const tabId = url.searchParams.get('id');

        if (!tabId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing tab ID' }));
            return;
        }

        // If in init mode, accept the connection and set the ID
        if (!this.editorId) {
            this.editorId = tabId;
            this.onEditorId && this.onEditorId(tabId);
        }

        const response: PortDiscoveryResponse = {
            status: this.editorId === tabId ? 'configured' : 'init',
            id: this.editorId,
            port: this.port!,
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    }

    private setupSocketHandlers(): void {
        if (!this.io) return;

        this.io.on('connection', (socket) => {
            console.log(`Editor connected: ${socket.id}`);

            socket.on('protocol-message', async (message: ProtocolMessage) => {
                try {
                    const response = await this.handleProtocolMessage(message);
                    socket.emit('protocol-response', response);
                } catch (error) {
                    const errorPayload = {
                        type: message.payload.type,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    } as any;
                    const errorResponse = createProtocolResponse(message.id, errorPayload);
                    socket.emit('protocol-response', errorResponse);
                }
            });

            socket.on('disconnect', () => {
                console.log(`Editor disconnected: ${socket.id}`);
            });
        });
    }

    private async handleProtocolMessage(message: ProtocolMessage): Promise<ProtocolResponse> {
        const { id, payload } = message;

        switch (payload.type) {
            case 'publish':
                if (!this.handlers.publish) {
                    throw new Error('Publish handler not registered');
                }
                const publishResult = await this.handlers.publish(payload as PublishMessage);
                return createProtocolResponse(id, publishResult);

            case 'saveImage':
                if (!this.handlers.saveImage) {
                    throw new Error('Save image handler not registered');
                }
                const saveResult = await this.handlers.saveImage(payload as SaveImageMessage);
                return createProtocolResponse(id, saveResult);

            case 'hasImage':
                if (!this.handlers.hasImage) {
                    throw new Error('Has image handler not registered');
                }
                const hasResult = await this.handlers.hasImage(payload as HasImageMessage);
                return createProtocolResponse(id, hasResult);

            default:
                throw new Error(`Unknown message type: ${(payload as any).type}`);
        }
    }
}

export function createEditorServer(options: EditorServerOptions): EditorServer {
    return new EditorServer(options);
}
