import {
    EditorProtocol,
    PublishMessage,
    SaveImageMessage,
    HasImageMessage,
    GetProjectInfoMessage,
    ExportMessage,
    ImportMessage,
    PublishResponse,
    SaveImageResponse,
    HasImageResponse,
    GetProjectInfoResponse,
    ExportResponse,
    ImportResponse,
    EditorProtocolMessageTypes,
    EditorProtocolResponseTypes,
} from '@jay-framework/editor-protocol';
import {
    ConnectionManager,
    ConnectionManagerOptions,
    ConnectionStateCallback,
} from './connection-manager';

export interface EditorClientOptions extends ConnectionManagerOptions {
    // Additional editor-specific options can be added here
}

export class EditorClient implements EditorProtocol {
    private connectionManager: ConnectionManager;

    constructor(connectionManager: ConnectionManager) {
        this.connectionManager = connectionManager;
    }

    // Connection management - delegate to ConnectionManager
    async connect(): Promise<void> {
        return this.connectionManager.connect();
    }

    async disconnect(): Promise<void> {
        return this.connectionManager.disconnect();
    }

    getConnectionState() {
        return this.connectionManager.getConnectionState();
    }

    onConnectionStateChange(callback: ConnectionStateCallback): () => void {
        return this.connectionManager.onConnectionStateChange(callback);
    }

    // EditorProtocol implementation - delegate to ConnectionManager
    async publish(params: PublishMessage): Promise<PublishResponse> {
        return this.connectionManager.sendMessage<never, PublishMessage>(params);
    }

    async saveImage(params: SaveImageMessage): Promise<SaveImageResponse> {
        return this.connectionManager.sendMessage<never, SaveImageMessage>(params);
    }

    async hasImage(params: HasImageMessage): Promise<HasImageResponse> {
        return this.connectionManager.sendMessage<never, HasImageMessage>(params);
    }

    async getProjectInfo(params: GetProjectInfoMessage): Promise<GetProjectInfoResponse> {
        return this.connectionManager.sendMessage<never, GetProjectInfoMessage>(params);
    }

    async export<TVendorDoc>(params: ExportMessage<TVendorDoc>): Promise<ExportResponse> {
        return this.connectionManager.sendMessage<TVendorDoc, ExportMessage<TVendorDoc>>(params);
    }

    async import<TVendorDoc>(
        params: ImportMessage<TVendorDoc>,
    ): Promise<ImportResponse<TVendorDoc>> {
        return this.connectionManager.sendMessage<TVendorDoc, ImportMessage<TVendorDoc>>(params);
    }

    async send<TVendorDoc>(
        params: EditorProtocolMessageTypes<TVendorDoc>,
    ): Promise<EditorProtocolResponseTypes<TVendorDoc>> {
        return this.connectionManager.sendMessage<
            TVendorDoc,
            EditorProtocolMessageTypes<TVendorDoc>
        >(params);
    }

    // Get access to the underlying connection manager if needed
    getConnectionManager(): ConnectionManager {
        return this.connectionManager;
    }
}

export function createEditorClient(options?: EditorClientOptions): EditorClient {
    const connectionManager = new ConnectionManager(options);
    return new EditorClient(connectionManager);
}

export function createEditorClientWithConnectionManager(
    connectionManager: ConnectionManager,
): EditorClient {
    return new EditorClient(connectionManager);
}
