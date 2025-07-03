import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditorServer, createEditorServer } from '../lib/editor-server';
import { DefaultProtocolHandlers, createDefaultHandlers } from '../lib/protocol-handlers';
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

  it('should create editor server instance', () => {
    server = createEditorServer({
      projectRoot: tempDir
    });

    expect(server).toBeInstanceOf(EditorServer);
  });

  it('should start server and return port and editor ID', async () => {
    server = createEditorServer({
      projectRoot: tempDir
    });

    const result = await server.start();

    expect(result.port).toBeGreaterThan(0);
    expect(result.editorId).toBe('init');
  });

  it('should register protocol handlers', () => {
    server = createEditorServer({
      projectRoot: tempDir
    });

    const publishHandler = async (params: any) => ({ status: [{ success: true, filePath: '/test/file.jay-html' }] as [{ success: boolean; filePath?: string; error?: string; }] });
    const saveImageHandler = async (params: any) => ({ success: true, imageUrl: '/assets/test.png' });
    const hasImageHandler = async (params: any) => ({ exists: false });

    server.onPublish(publishHandler);
    server.onSaveImage(saveImageHandler);
    server.onHasImage(hasImageHandler);

    // No errors should be thrown
    expect(true).toBe(true);
  });
});

describe('Default Protocol Handlers', () => {
  let tempDir: string;
  let handlers: DefaultProtocolHandlers;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-test-dir');
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    mkdirSync(tempDir, { recursive: true });
    
    handlers = createDefaultHandlers({
      projectRoot: tempDir
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should create default handlers instance', () => {
    expect(handlers).toBeInstanceOf(DefaultProtocolHandlers);
  });

  it('should handle publish operation', async () => {
    const params = {
      pages: [{
        route: '/test',
        jayHtml: '<div>Test content</div>',
        name: 'test-page'
      }] as [{
        route: string;
        jayHtml: string;
        name: string;
      }]
    };

    const result = await handlers.handlePublish(params);

    expect(result.status).toHaveLength(1);
    expect(result.status[0].success).toBe(true);
    expect(result.status[0].filePath).toContain('test-page.jay-html');
  });

  it('should handle save image operation', async () => {
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    const params = {
      imageId: 'test-image',
      imageData: base64Image
    };

    const result = await handlers.handleSaveImage(params);

    expect(result.success).toBe(true);
    expect(result.imageUrl).toContain('test-image.png');
  });

  it('should handle has image operation', async () => {
    const params = {
      imageId: 'non-existent-image'
    };

    const result = await handlers.handleHasImage(params);

    expect(result.exists).toBe(false);
  });
}); 