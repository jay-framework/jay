import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig, updateConfig, getConfigWithDefaults, JayConfig } from '../lib/config';

describe('Config Loading', () => {
    const configPath = path.resolve('.jay');
    let originalConfig: string | null = null;

    beforeEach(() => {
        if (fs.existsSync(configPath)) {
            originalConfig = fs.readFileSync(configPath, 'utf-8');
        }
    });

    afterEach(() => {
        if (originalConfig) {
            fs.writeFileSync(configPath, originalConfig);
        } else if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
    });

    it('should load default config when no .jay file exists', () => {
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }

        const config = loadConfig();

        expect(config.devServer?.portRange).toEqual([3000, 3100]);
    });

    it('should load custom config from .jay file (YAML)', () => {
        const customConfig = `devServer:\n  portRange: [4000, 4100]\n`;
        fs.writeFileSync(configPath, customConfig);

        const config = loadConfig();

        expect(config.devServer?.portRange).toEqual([4000, 4100]);
    });

    it('should merge custom config with defaults (YAML)', () => {
        const partialConfig = `devServer:\n  portRange: [5000, 5100]\n`;
        fs.writeFileSync(configPath, partialConfig);

        const config = loadConfig();

        expect(config.devServer?.portRange).toEqual([5000, 5100]);
        expect(config.devServer?.pagesBase).toEqual('./src/pages');
    });

    it('should update config preserving existing values', () => {
        const initialConfig = `devServer:\n  portRange: [3000, 3100]\n`;
        fs.writeFileSync(configPath, initialConfig);

        updateConfig({
            devServer: {
                publicFolder: './static',
            },
        });

        const updatedConfig = loadConfig();
        expect(updatedConfig.devServer?.publicFolder).toEqual('./static');
        expect(updatedConfig.devServer?.portRange).toEqual([3000, 3100]);
    });

    it('should load custom pagesBase and publicFolder', () => {
        const customConfig = `devServer:\n  pagesBase: './custom/pages'\n  publicFolder: './static'\n`;
        fs.writeFileSync(configPath, customConfig);

        const config = loadConfig();
        expect(config.devServer?.pagesBase).toEqual('./custom/pages');
        expect(config.devServer?.publicFolder).toEqual('./static');
        expect(config.devServer?.portRange).toEqual([3000, 3100]);
    });

    it('should resolve config with defaults', () => {
        const partialConfig: JayConfig = {
            devServer: {
                pagesBase: './custom/pages',
            },
        };

        const resolved = getConfigWithDefaults(partialConfig);

        expect(resolved.devServer.pagesBase).toEqual('./custom/pages');
        expect(resolved.devServer.publicFolder).toEqual('./public');
        expect(resolved.devServer.portRange).toEqual([3000, 3100]);
    });
});
