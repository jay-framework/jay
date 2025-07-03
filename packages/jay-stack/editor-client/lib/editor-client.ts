import type { 
  EditorProtocol, 
  PublishMessage,
  SaveImageMessage,
  HasImageMessage,
  PublishResponse,
  SaveImageResponse,
  HasImageResponse
} from '@jay-framework/editor-protocol';
import { ConnectionManager, ConnectionManagerOptions } from './connection-manager';

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

  onConnectionStateChange(callback: (state: any) => void): void {
    return this.connectionManager.onConnectionStateChange(callback);
  }

  // EditorProtocol implementation - delegate to ConnectionManager
  async publish(params: PublishMessage): Promise<PublishResponse> {
    return this.connectionManager.sendMessage('publish', params);
  }

  async saveImage(params: SaveImageMessage): Promise<SaveImageResponse> {
    return this.connectionManager.sendMessage('saveImage', params);
  }

  async hasImage(params: HasImageMessage): Promise<HasImageResponse> {
    return this.connectionManager.sendMessage('hasImage', params);
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

export function createEditorClientWithConnectionManager(connectionManager: ConnectionManager): EditorClient {
  return new EditorClient(connectionManager);
} 