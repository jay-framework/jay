import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorClient, createEditorClient, createEditorClientWithConnectionManager } from '../lib';
import { ConnectionManager, createConnectionManager } from '../lib';
import { createTestServer, TestServer } from './test-server';
import type { PublishMessage } from '@jay-framework/editor-protocol';

describe('Editor Client', () => {
  let client: EditorClient;
  let connectionManager: ConnectionManager;
  let testServer: TestServer;
  let serverResponse: any;

  beforeEach(async () => {
    // Start test server
    testServer = createTestServer({
      editorId: 'test-editor-id',
      status: 'init'
    });
    serverResponse = await testServer.start();

    // Create connection manager that will connect to our test server
    connectionManager = createConnectionManager({
      portRange: [serverResponse.port, serverResponse.port], // Only scan the test server port
      scanTimeout: 1000,
      retryAttempts: 1,
      editorId: 'test-editor-id'
    });
    client = createEditorClientWithConnectionManager(connectionManager);
  });

  afterEach(async () => {
    await client.disconnect();
    await serverResponse.close();
  });

  it('should create editor client instance', () => {
    expect(client).toBeInstanceOf(EditorClient);
  });

  it('should have initial disconnected state', () => {
    expect(client.getConnectionState()).toBe('disconnected');
  });

  it('should connect to test server', async () => {
    await client.connect();
    expect(client.getConnectionState()).toBe('connected');
  });

  it('should publish jay-html files', async () => {
    // Set up test server handler
    testServer.onPublish(async (msg) => {
      expect(msg.type).toBe('publish');
      expect(msg.pages).toHaveLength(1);
      expect(msg.pages[0].route).toBe('/test');
      expect(msg.pages[0].name).toBe('test-page');
      return {
        status: [{ success: true, filePath: '/test/test-page.jay-html' }]
      };
    });

    await client.connect();

    const result = await client.publish({
      type: 'publish',
      pages: [{
        route: '/test',
        jayHtml: '<div>Test content</div>',
        name: 'test-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    });

    expect(result.status).toHaveLength(1);
    expect(result.status[0].success).toBe(true);
    expect(result.status[0].filePath).toBe('/test/test-page.jay-html');
  });

  it('should save images', async () => {
    // Set up test server handler
    testServer.onSaveImage(async (msg) => {
      expect(msg.type).toBe('saveImage');
      expect(msg.imageId).toBe('test-image');
      expect(msg.imageData).toContain('data:image/png;base64');
      return {
        success: true,
        imageUrl: '/assets/test-image.png'
      };
    });

    await client.connect();

    const result = await client.saveImage({
      type: 'saveImage',
      imageId: 'test-image',
      imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    });

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe('/assets/test-image.png');
  });

  it('should check if images exist', async () => {
    // Set up test server handler
    testServer.onHasImage(async (msg) => {
      expect(msg.type).toBe('hasImage');
      expect(msg.imageId).toBe('test-image');
      return {
        exists: true,
        imageUrl: '/assets/test-image.png'
      };
    });

    await client.connect();

    const result = await client.hasImage({
      type: 'hasImage',
      imageId: 'test-image'
    });

    expect(result.exists).toBe(true);
    expect(result.imageUrl).toBe('/assets/test-image.png');
  });

  it('should handle server errors', async () => {
    // Set up test server handler that throws an error
    testServer.onPublish(async () => {
      throw new Error('Test server error');
    });

    await client.connect();

    await expect(client.publish({
      type: 'publish',
      pages: [{
        route: '/test',
        jayHtml: '<div>Test</div>',
        name: 'test-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    })).rejects.toThrow('Test server error');
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
  let testServer: TestServer;
  let serverResponse: any;

  beforeEach(async () => {
    // Start test server
    testServer = createTestServer({
      editorId: 'test-editor-id',
      status: 'init'
    });
    serverResponse = await testServer.start();

    manager = createConnectionManager({
      portRange: [serverResponse.port, serverResponse.port],
      scanTimeout: 1000,
      retryAttempts: 1,
      editorId: 'test-editor-id',
      autoReconnect: false
    });
  });

  afterEach(async () => {
    await manager.disconnect();
    await serverResponse.close();
  });

  it('should create connection manager instance', () => {
    expect(manager).toBeInstanceOf(ConnectionManager);
  });

  it('should have initial disconnected state', () => {
    expect(manager.getConnectionState()).toBe('disconnected');
  });

  it('should connect to test server', async () => {
    await manager.connect();
    expect(manager.getConnectionState()).toBe('connected');
  });

  it('should send messages when connected', async () => {
    // Set up test server handler
    testServer.onPublish(async (msg) => {
      expect(msg.type).toBe('publish');
      return { status: [{ success: true, filePath: '/test/file.jay-html' }] };
    });

    await manager.connect();

    const result = await manager.sendMessage<PublishMessage>({
      type: 'publish',
      pages: [{
        route: '/test',
        jayHtml: '<div>Test</div>',
        name: 'test-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    });

    expect(result.status).toHaveLength(1);
    expect(result.status[0].success).toBe(true);
    expect(result.status[0].filePath).toBe('/test/file.jay-html');
  });

  it('should handle connection errors gracefully', async () => {
    // Create manager with non-existent port range
    const badManager = createConnectionManager({
      portRange: [9999, 9999],
      scanTimeout: 100,
      retryAttempts: 1
    });

    await expect(badManager.connect()).rejects.toThrow('No editor server found');
    expect(badManager.getConnectionState()).toBe('error');
  });

  it('should handle manual disconnect', async () => {
    await manager.connect();
    expect(manager.getConnectionState()).toBe('connected');
    
    await manager.disconnect();
    expect(manager.getConnectionState()).toBe('disconnected');
  });

  it('should handle server in configured mode', async () => {
    // Close the init server
    await serverResponse.close();

    // Start a new server in configured mode
    const configuredServer = createTestServer({
      editorId: 'test-editor-id',
      status: 'configured'
    });
    const configuredResponse = await configuredServer.start();

    // Create manager with different editor ID (should not connect)
    const wrongManager = createConnectionManager({
      portRange: [configuredResponse.port, configuredResponse.port],
      scanTimeout: 500,
      retryAttempts: 1,
      editorId: 'wrong-editor-id'
    });

    await expect(wrongManager.connect()).rejects.toThrow('No editor server found');

    // Create manager with correct editor ID (should connect)
    const correctManager = createConnectionManager({
      portRange: [configuredResponse.port, configuredResponse.port],
      scanTimeout: 500,
      retryAttempts: 1,
      editorId: 'test-editor-id'
    });

    await correctManager.connect();
    expect(correctManager.getConnectionState()).toBe('connected');

    await correctManager.disconnect();
    await configuredResponse.close();
  }, 10000); // Increase timeout for this test
});

describe('Factory Functions', () => {
  let testServer: TestServer;
  let serverResponse: any;

  beforeEach(async () => {
    testServer = createTestServer();
    serverResponse = await testServer.start();
  });

  afterEach(async () => {
    await serverResponse.close();
  });

  it('should create client with options', async () => {
    const client = createEditorClient({
      portRange: [serverResponse.port, serverResponse.port],
      scanTimeout: 1000,
      retryAttempts: 1,
      editorId: 'test-editor-id'
    });
    
    expect(client).toBeInstanceOf(EditorClient);
    expect(client.getConnectionState()).toBe('disconnected');

    await client.connect();
    expect(client.getConnectionState()).toBe('connected');
    await client.disconnect();
  });

  it('should create client with existing connection manager', async () => {
    const manager = createConnectionManager({
      portRange: [serverResponse.port, serverResponse.port],
      scanTimeout: 1000,
      retryAttempts: 1,
      editorId: 'test-editor-id'
    });
    const client = createEditorClientWithConnectionManager(manager);
    
    expect(client).toBeInstanceOf(EditorClient);
    expect(client.getConnectionManager()).toBe(manager);

    await client.connect();
    expect(client.getConnectionState()).toBe('connected');
    await client.disconnect();
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