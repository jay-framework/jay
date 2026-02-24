import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import type { PluginSetupContext } from '@jay-framework/stack-server-runtime';
import { setupGeminiAgent } from '../lib/setup';

vi.mock('fs');

function makeCtx(overrides: Partial<PluginSetupContext> = {}): PluginSetupContext {
    return {
        pluginName: 'gemini-agent',
        projectRoot: '/project',
        configDir: '/project/config',
        services: new Map(),
        force: false,
        ...overrides,
    };
}

describe('setupGeminiAgent', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create config template when file does not exist', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        const writeSpy = vi.mocked(fs.writeFileSync);
        const mkdirSpy = vi.mocked(fs.mkdirSync);

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('needs-config');
        expect(result.configCreated).toEqual(['config/.gemini.yaml']);
        expect(mkdirSpy).toHaveBeenCalledWith('/project/config', { recursive: true });
        expect(writeSpy).toHaveBeenCalledWith(
            '/project/config/.gemini.yaml',
            expect.stringContaining('apiKey'),
            'utf-8',
        );
    });

    it('should skip mkdir when configDir already exists', async () => {
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            if (p === '/project/config/.gemini.yaml') return false;
            if (p === '/project/config') return true;
            return false;
        });
        const mkdirSpy = vi.mocked(fs.mkdirSync);
        vi.mocked(fs.writeFileSync).mockImplementation(() => {});

        await setupGeminiAgent(makeCtx());

        expect(mkdirSpy).not.toHaveBeenCalled();
    });

    it('should detect placeholder apiKey', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: "<your-gemini-api-key>"\n');

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('needs-config');
        expect(result.message).toContain('placeholder');
    });

    it('should detect empty apiKey', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: ""\n');

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('needs-config');
    });

    it('should report error when config is empty', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('');

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('error');
        expect(result.message).toContain('empty');
    });

    it('should report initError when present', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: "real-key-123"\n');

        const result = await setupGeminiAgent(makeCtx({ initError: new Error('Invalid API key') }));

        expect(result.status).toBe('error');
        expect(result.message).toContain('Invalid API key');
    });

    it('should return configured when everything is valid', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(
            'apiKey: "real-key-123"\nmodel: gemini-2.0-pro\n',
        );

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('configured');
        expect(result.message).toContain('gemini-2.0-pro');
    });

    it('should use default model in message when model is not set', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: "real-key-123"\n');

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('configured');
        expect(result.message).toContain('gemini-2.0-flash');
    });

    it('should handle read errors gracefully', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation(() => {
            throw new Error('EACCES');
        });

        const result = await setupGeminiAgent(makeCtx());

        expect(result.status).toBe('error');
        expect(result.message).toContain('EACCES');
    });
});
