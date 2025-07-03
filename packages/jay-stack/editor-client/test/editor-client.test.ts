import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorClient, createEditorClient, createEditorClientWithConnectionManager } from '../lib/editor-client';
import { ConnectionManager, createConnectionManager } from '../lib/connection-manager';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false
  }))
}));

// Mock fetch
global.fetch = vi.fn();

describe('Editor Client', () => {
  let client: EditorClient;
  let connectionManager: ConnectionManager;

  beforeEach(() => {
    connectionManager = createConnectionManager({
      portRange: [3101, 3105],
      scanTimeout: 100,
      retryAttempts: 1
    });
    client = createEditorClientWithConnectionManager(connectionManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create editor client instance', () => {
    expect(client).toBeInstanceOf(EditorClient);
  });

  it('should have initial disconnected state', () => {
    expect(client.getConnectionState()).toBe('disconnected');
  });

  it('should delegate connection to ConnectionManager', async () => {
    // Mock the connection manager's connect method
    const connectSpy = vi.spyOn(connectionManager, 'connect').mockResolvedValue();
    
    await client.connect();
    
    expect(connectSpy).toHaveBeenCalled();
  });

  it('should delegate protocol methods to ConnectionManager', async () => {
    // Mock the connection manager's sendMessage method
    const sendMessageSpy = vi.spyOn(connectionManager, 'sendMessage').mockResolvedValue({
      status: [{ success: true, filePath: '/test/file.jay-html' }]
    });

    const params = {
      pages: [{
        route: '/test',
        jayHtml: '<div>Test</div>',
        name: 'test-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    };

    await client.publish(params);
    
    expect(sendMessageSpy).toHaveBeenCalledWith('publish', params);
  });

  it('should provide access to underlying ConnectionManager', () => {
    const manager = client.getConnectionManager();
    expect(manager).toBe(connectionManager);
  });

  it('should implement EditorProtocol interface', () => {
    expect(typeof client.publish).toBe('function');
    expect(typeof client.saveImage).toBe('function');
    expect(typeof client.hasImage).toBe('function');
  });
});

describe('Connection Manager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = createConnectionManager({
      portRange: [3101, 3105],
      scanTimeout: 100,
      retryAttempts: 1,
      autoReconnect: false
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create connection manager instance', () => {
    expect(manager).toBeInstanceOf(ConnectionManager);
  });

  it('should have initial disconnected state', () => {
    expect(manager.getConnectionState()).toBe('disconnected');
  });

  it('should handle connection errors gracefully', async () => {
    // Mock fetch to return error
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(manager.connect()).rejects.toThrow('No editor server found');
    expect(manager.getConnectionState()).toBe('error');
  });

  it('should handle manual disconnect', async () => {
    await manager.disconnect();
    expect(manager.getConnectionState()).toBe('disconnected');
  });

  it('should send messages when connected', async () => {
    // Mock successful connection
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'init', port: 3101 })
    });

    // Mock socket.io connection
    const mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn()
    };
    (require('socket.io-client').io as any).mockReturnValue(mockSocket);

    await manager.connect();
    
    // Mock the socket response
    const mockResponse = { id: 'test-id', success: true, data: { result: 'success' } };
    const protocolResponseHandler = mockSocket.on.mock.calls.find(
      call => call[0] === 'protocol-response'
    )?.[1];
    
    if (protocolResponseHandler) {
      protocolResponseHandler(mockResponse);
    }

    const result = await manager.sendMessage('publish', { test: 'data' });
    expect(result).toEqual({ result: 'success' });
  });
});

describe('Factory Functions', () => {
  it('should create client with options', () => {
    const client = createEditorClient({
      portRange: [3101, 3105],
      scanTimeout: 100
    });
    
    expect(client).toBeInstanceOf(EditorClient);
    expect(client.getConnectionState()).toBe('disconnected');
  });

  it('should create client with existing connection manager', () => {
    const manager = createConnectionManager();
    const client = createEditorClientWithConnectionManager(manager);
    
    expect(client).toBeInstanceOf(EditorClient);
    expect(client.getConnectionManager()).toBe(manager);
  });
});

describe('Protocol Message Types', () => {
  it('should have correct message structure', () => {
    const publishMessage = {
      pages: [{
        route: '/test',
        jayHtml: '<div>Test</div>',
        name: 'test-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    };

    const saveImageMessage = {
      imageId: 'test-image',
      imageData: 'data:image/png;base64,test'
    };

    const hasImageMessage = {
      imageId: 'test-image'
    };

    expect(publishMessage.pages).toHaveLength(1);
    expect(saveImageMessage.imageId).toBe('test-image');
    expect(hasImageMessage.imageId).toBe('test-image');
  });
}); 