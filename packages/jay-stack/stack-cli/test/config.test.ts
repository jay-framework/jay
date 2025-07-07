import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig, updateConfig, JayConfig } from '../lib/config';

describe('Config Loading', () => {
    const configPath = path.resolve('.jay');
    let originalConfig: string | null = null;

    beforeEach(() => {
        // Backup existing config if it exists
        if (fs.existsSync(configPath)) {
            originalConfig = fs.readFileSync(configPath, 'utf-8');
        }
    });

    afterEach(() => {
        // Restore original config or remove test config
        if (originalConfig) {
            fs.writeFileSync(configPath, originalConfig);
        } else if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    });

    it('should load default config when no .jay file exists', () => {
        // Remove config file if it exists
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }

        const config = loadConfig();

        expect(config.devServer?.portRange).toEqual([3000, 3100]);
        expect(config.editorServer?.portRange).toEqual([3101, 3200]);
    });

    it('should load custom config from .jay file (YAML)', () => {
        const customConfig = `devServer:\n  portRange: [4000, 4100]\neditorServer:\n  portRange: [4101, 4200]\n`;
        fs.writeFileSync(configPath, customConfig);

        const config = loadConfig();

        expect(config.devServer?.portRange).toEqual([4000, 4100]);
        expect(config.editorServer?.portRange).toEqual([4101, 4200]);
    });

    it('should merge custom config with defaults (YAML)', () => {
        const partialConfig = `devServer:\n  portRange: [5000, 5100]\n`;
        fs.writeFileSync(configPath, partialConfig);

        const config = loadConfig();

        expect(config.devServer?.portRange).toEqual([5000, 5100]);
        expect(config.editorServer?.portRange).toEqual([3101, 3200]); // Default value
    });

    it('should update config with editorId', () => {
        const initialConfig = `devServer:\n  portRange: [3000, 3100]\neditorServer:\n  portRange: [3101, 3200]\n`;
        fs.writeFileSync(configPath, initialConfig);

        // Update with editorId
        updateConfig({
            editorServer: {
                editorId: 'test-editor-123',
            },
        });

        const updatedConfig = loadConfig();
        expect(updatedConfig.editorServer?.editorId).toEqual('test-editor-123');
        expect(updatedConfig.devServer?.portRange).toEqual([3000, 3100]); // Should preserve existing config
    });

    it('should load custom pagesBase and publicFolder', () => {
        const customConfig = `devServer:\n  pagesBase: './custom/pages'\n  publicFolder: './static'\neditorServer:\n  portRange: [3101, 3200]\n`;
        fs.writeFileSync(configPath, customConfig);

        const config = loadConfig();
        expect(config.devServer?.pagesBase).toEqual('./custom/pages');
        expect(config.devServer?.publicFolder).toEqual('./static');
        expect(config.devServer?.portRange).toEqual([3000, 3100]); // Should use default
    });
});
