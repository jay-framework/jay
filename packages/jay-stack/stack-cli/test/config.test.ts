import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    loadConfig,
    updateConfig,
    getConfigWithDefaults,
    resolveActionBodyLimitBytes,
    JayConfig,
} from '../lib/config';

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

describe('resolveActionBodyLimitBytes (DL#234)', () => {
    let projectRoot: string;

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jay-dl234-config-'));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('should default to 1 MiB', () => {
        expect(resolveActionBodyLimitBytes({})).toEqual(1_048_576);
    });

    it('should read server.actionBodyLimitBytes from .jay', () => {
        fs.writeFileSync(
            path.join(projectRoot, '.jay'),
            'server:\n  actionBodyLimitBytes: 2097152\n',
        );

        const config = loadConfig(projectRoot);

        expect(config.server).toEqual({ actionBodyLimitBytes: 2097152 });
        expect(resolveActionBodyLimitBytes(config)).toEqual(2097152);
    });

    it('should let a programmatic override win over .jay', () => {
        const config: JayConfig = { server: { actionBodyLimitBytes: 2097152 } };
        expect(resolveActionBodyLimitBytes(config, 5242880)).toEqual(5242880);
    });

    it.each([0, -5, 1.5, 'big' as unknown as number])(
        'should fall back to the default for an invalid .jay value (%s)',
        (value) => {
            expect(
                resolveActionBodyLimitBytes({ server: { actionBodyLimitBytes: value } }),
            ).toEqual(1_048_576);
        },
    );

    it('should ignore an invalid override', () => {
        const config: JayConfig = { server: { actionBodyLimitBytes: 2097152 } };
        expect(resolveActionBodyLimitBytes(config, 0)).toEqual(2097152);
    });
});
