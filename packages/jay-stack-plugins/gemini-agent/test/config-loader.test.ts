import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../lib/config-loader';

vi.mock('fs');
vi.mock('path', async () => {
    const actual = await vi.importActual<typeof path>('path');
    return {
        ...actual,
        join: vi.fn((...args: string[]) => actual.join(...args)),
    };
});

describe('config-loader', () => {
    const mockCwd = '/project';
    const configPath = '/project/config/.gemini.yaml';

    beforeEach(() => {
        vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should load a valid config', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(
            'apiKey: "test-api-key-123"\nmodel: gemini-2.0-pro\nsystemPrompt: "Be helpful"\n',
        );

        const config = loadConfig();

        expect(config).toEqual({
            apiKey: 'test-api-key-123',
            model: 'gemini-2.0-pro',
            systemPrompt: 'Be helpful',
        });
    });

    it('should use default model when not specified', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: "test-key"\n');

        const config = loadConfig();

        expect(config.model).toBe('gemini-2.0-flash');
    });

    it('should throw when config file does not exist', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(() => loadConfig()).toThrow('Gemini config file not found');
    });

    it('should throw when apiKey is missing', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('model: gemini-2.0-flash\n');

        expect(() => loadConfig()).toThrow('"apiKey" is required');
    });

    it('should throw when apiKey is empty', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: ""\n');

        expect(() => loadConfig()).toThrow('"apiKey" must be a non-empty string');
    });

    it('should throw when apiKey has placeholder value', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: "<your-gemini-api-key>"\n');

        expect(() => loadConfig()).toThrow('placeholder value');
    });

    it('should throw when config file is empty', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('');

        expect(() => loadConfig()).toThrow('empty or invalid');
    });

    it('should set systemPrompt to undefined when not provided', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('apiKey: "test-key"\n');

        const config = loadConfig();

        expect(config.systemPrompt).toBeUndefined();
    });
});
