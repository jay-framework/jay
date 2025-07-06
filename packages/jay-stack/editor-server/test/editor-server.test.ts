import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorServer, createEditorServer } from '../lib';
import { DefaultProtocolHandlers, createDefaultHandlers } from './protocol-handlers';
import { createEditorClient } from '@jay-framework/editor-client';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';

describe('Editor Server', () => {
  let tempDir: string;
  let server: EditorServer;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = join(process.cwd(), 'temp-test-dir');
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should start server and return port and editor ID', async () => {
    server = createEditorServer({
      projectRoot: tempDir
    });

    const result = await server.start();

    expect(result.port).toBeGreaterThan(0);
    expect(result.editorId).toBe('init');
  });
});

describe('Editor Server End-to-End Tests', () => {
  let tempDir: string;
  let server: EditorServer;
  let client: any;
  let serverInfo: { port: number; editorId: string };

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = join(process.cwd(), 'temp-test-dir');
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });

    // Create server with default handlers
    server = createEditorServer({
      projectRoot: tempDir
    });

    const handlers = createDefaultHandlers({
      projectRoot: tempDir
    });

    server.onPublish(handlers.handlePublish.bind(handlers));
    server.onSaveImage(handlers.handleSaveImage.bind(handlers));
    server.onHasImage(handlers.handleHasImage.bind(handlers));

    // Start server
    serverInfo = await server.start();

    // Create client
    client = createEditorClient({
      portRange: [serverInfo.port, serverInfo.port],
      scanTimeout: 1000,
      retryAttempts: 1,
      editorId: serverInfo.editorId
    });
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
    if (server) {
      await server.stop();
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should establish connection between client and server', async () => {
    await client.connect();
    expect(client.getConnectionState()).toBe('connected');
  });

  it('should handle publish operation end-to-end', async () => {
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
    expect(result.status[0].filePath).toContain('test-page.jay-html');

    // Verify file was actually created
    const expectedPath = join(tempDir, 'test', 'test-page.jay-html');
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('should handle save image operation end-to-end', async () => {
    await client.connect();

    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const result = await client.saveImage({
      type: 'saveImage',
      imageId: 'test-image',
      imageData: base64Image
    });

    expect(result.success).toBe(true);
    expect(result.imageUrl).toBe('/assets/test-image.png');

    // Verify file was actually created
    const expectedPath = join(tempDir, 'public', 'assets', 'test-image.png');
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('should handle has image operation end-to-end', async () => {
    await client.connect();

    // First save an image
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    await client.saveImage({
      type: 'saveImage',
      imageId: 'test-image',
      imageData: base64Image
    });

    // Then check if it exists
    const result = await client.hasImage({
      type: 'hasImage',
      imageId: 'test-image'
    });

    expect(result.exists).toBe(true);
    expect(result.imageUrl).toBe('/assets/test-image.png');

    // Check for non-existent image
    const nonExistentResult = await client.hasImage({
      type: 'hasImage',
      imageId: 'non-existent-image'
    });

    expect(nonExistentResult.exists).toBe(false);
  });

  it('should handle multiple publish operations', async () => {
    await client.connect();

    const result = await client.publish({
      type: 'publish',
      pages: [
        {
          route: '/page1',
          jayHtml: '<div>Page 1 content</div>',
          name: 'page1'
        },
        {
          route: '/page2',
          jayHtml: '<div>Page 2 content</div>',
          name: 'page2'
        }
      ] as Array<{
        route: string;
        jayHtml: string;
        name: string;
      }>
    });

    expect(result.status).toHaveLength(2);
    expect(result.status[0].success).toBe(true);
    expect(result.status[1].success).toBe(true);
    expect(result.status[0].filePath).toContain('page1.jay-html');
    expect(result.status[1].filePath).toContain('page2.jay-html');

    // Verify files were actually created
    const path1 = join(tempDir, 'page1', 'page1.jay-html');
    const path2 = join(tempDir, 'page2', 'page2.jay-html');
    expect(existsSync(path1)).toBe(true);
    expect(existsSync(path2)).toBe(true);
  });

  it('should handle server in configured mode', async () => {
    // Stop the current server
    await server.stop();
    await client.disconnect();

    // Create a new server with a specific editor ID
    const configuredServer = createEditorServer({
      projectRoot: tempDir
    });

    const handlers = createDefaultHandlers({
      projectRoot: tempDir
    });

    configuredServer.onPublish(handlers.handlePublish.bind(handlers));
    configuredServer.onSaveImage(handlers.handleSaveImage.bind(handlers));
    configuredServer.onHasImage(handlers.handleHasImage.bind(handlers));

    const configuredServerInfo = await configuredServer.start();

    // Create client with matching editor ID
    const configuredClient = createEditorClient({
      portRange: [configuredServerInfo.port, configuredServerInfo.port],
      scanTimeout: 1000,
      retryAttempts: 1,
      editorId: configuredServerInfo.editorId
    });

    await configuredClient.connect();
    expect(configuredClient.getConnectionState()).toBe('connected');

    // Test that operations work
    const result = await configuredClient.publish({
      type: 'publish',
      pages: [{
        route: '/configured',
        jayHtml: '<div>Configured content</div>',
        name: 'configured-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    });

    expect(result.status[0].success).toBe(true);

    await configuredClient.disconnect();
    await configuredServer.stop();
  });

  it('should handle concurrent operations', async () => {
    await client.connect();

    // Perform multiple operations concurrently
    const [publishResult, saveImageResult, hasImageResult] = await Promise.all([
      client.publish({
        type: 'publish',
        pages: [{
          route: '/concurrent',
          jayHtml: '<div>Concurrent content</div>',
          name: 'concurrent-page'
        }] as [{
          route: string;
          jayHtml: string;
          name: string;
        }]
      }),
      client.saveImage({
        type: 'saveImage',
        imageId: 'concurrent-image',
        imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      }),
      client.hasImage({
        type: 'hasImage',
        imageId: 'non-existent-concurrent'
      })
    ]);

    expect(publishResult.status[0].success).toBe(true);
    expect(saveImageResult.success).toBe(true);
    expect(hasImageResult.exists).toBe(false);
  });
}, 30000); // Increase timeout for end-to-end tests 