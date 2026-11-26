import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    loadConfig,
    updateConfig,
    getConfigWithDefaults,
    resolveActionBodyLimitBytes,
    resolveActionPollAfterMs,
    applyEnvOverrides,
    ENV_OVERRIDES,
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

describe('resolveActionPollAfterMs (DL#239)', () => {
    it('is undefined (off) when absent', () => {
        expect(resolveActionPollAfterMs({})).toBeUndefined();
        expect(resolveActionPollAfterMs({ server: {} })).toBeUndefined();
    });

    it('reads a positive integer from .jay', () => {
        expect(resolveActionPollAfterMs({ server: { actionPollAfterMs: 25000 } })).toEqual(25000);
    });

    it('lets a programmatic override win', () => {
        expect(resolveActionPollAfterMs({ server: { actionPollAfterMs: 25000 } }, 50)).toEqual(50);
    });

    it.each([0, -5, 1.5, 'x' as unknown as number])('is off for an invalid value (%s)', (value) => {
        expect(resolveActionPollAfterMs({ server: { actionPollAfterMs: value } })).toBeUndefined();
    });
});

describe('applyEnvOverrides (DL#240)', () => {
    it('lets an env var override a .jay value', () => {
        const config: JayConfig = { server: { actionBodyLimitBytes: 1000 } };
        applyEnvOverrides(config, { JAY_SERVER_ACTION_BODY_LIMIT_BYTES: '2097152' });
        expect(config.server?.actionBodyLimitBytes).toEqual(2097152);
    });

    it('sets a value when the .jay field (and section) is absent', () => {
        const config: JayConfig = {};
        applyEnvOverrides(config, { JAY_SERVER_ACTION_POLL_AFTER_MS: '25000' });
        expect(config.server?.actionPollAfterMs).toEqual(25000);
    });

    it('leaves the config untouched when no override env is set', () => {
        const config: JayConfig = { server: { staleWaitMs: 3000 } };
        applyEnvOverrides(config, {});
        expect(config).toEqual({ server: { staleWaitMs: 3000 } });
    });

    it('warns and ignores an invalid value, keeping the base value', () => {
        const config: JayConfig = { server: { actionBodyLimitBytes: 1000 } };
        applyEnvOverrides(config, { JAY_SERVER_ACTION_BODY_LIMIT_BYTES: 'not-a-number' });
        expect(config.server?.actionBodyLimitBytes).toEqual(1000);
    });

    it('parses on/off booleans', () => {
        const on: JayConfig = {};
        applyEnvOverrides(on, { JAY_SERVER_FRESHNESS_HEADER: 'off' });
        expect(on.server?.freshnessHeader).toBe(false);

        const off: JayConfig = {};
        applyEnvOverrides(off, { JAY_SERVER_FRESHNESS_HEADER: 'on' });
        expect(off.server?.freshnessHeader).toBe(true);
    });

    it('parses a comma-separated allowed-hosts list (replace, not merge)', () => {
        const config: JayConfig = { devServer: { allowedHosts: ['.from-file.dev'] } };
        applyEnvOverrides(config, { JAY_DEV_SERVER_ALLOWED_HOSTS: ' .a.dev , .b.dev ,' });
        expect(config.devServer?.allowedHosts).toEqual(['.a.dev', '.b.dev']);
    });

    it('parses the literal "true" for allowed-hosts', () => {
        const config: JayConfig = {};
        applyEnvOverrides(config, { JAY_DEV_SERVER_ALLOWED_HOSTS: 'true' });
        expect(config.devServer?.allowedHosts).toBe(true);
    });

    it('parses a port-range integer pair', () => {
        const config: JayConfig = {};
        applyEnvOverrides(config, { JAY_DEV_SERVER_PORT_RANGE: '4000,4100' });
        expect(config.devServer?.portRange).toEqual([4000, 4100]);
    });

    it('feeds resolveActionBodyLimitBytes after override', () => {
        const config: JayConfig = { server: { actionBodyLimitBytes: 1000 } };
        applyEnvOverrides(config, { JAY_SERVER_ACTION_BODY_LIMIT_BYTES: '2097152' });
        expect(resolveActionBodyLimitBytes(config)).toEqual(2097152);
    });

    // Verification criterion (DL#240 #4): every overridable leaf of JayConfig has exactly one
    // registry row. Update this list and the registry together when adding a config field.
    it('covers every overridable config field with exactly one registry row', () => {
        const names = ENV_OVERRIDES.map((e) => e.env).sort();
        expect(new Set(names).size).toEqual(names.length); // no duplicates
        expect(names).toEqual(
            [
                'JAY_DEV_SERVER_PORT_RANGE',
                'JAY_DEV_SERVER_PAGES_BASE',
                'JAY_DEV_SERVER_COMPONENTS_BASE',
                'JAY_DEV_SERVER_PUBLIC_FOLDER',
                'JAY_DEV_SERVER_CONFIG_BASE',
                'JAY_DEV_SERVER_ALLOWED_HOSTS',
                'JAY_DEV_SERVER_SOURCE_EDITING',
                'JAY_DEV_SERVER_BASE',
                'JAY_SITE_BASE_URL',
                'JAY_SITE_NAME',
                'JAY_SITE_LOGO',
                'JAY_SITE_DESCRIPTION',
                'JAY_SITE_SAME_AS',
                'JAY_SERVER_ACTION_BODY_LIMIT_BYTES',
                'JAY_SERVER_ACTION_POLL_AFTER_MS',
                'JAY_SERVER_STALE_WAIT_MS',
                'JAY_SERVER_MISS_TIMEOUT_MS',
                'JAY_SERVER_SLOW_RENDER_CONCURRENCY',
                'JAY_SERVER_FRESHNESS_HEADER',
                'JAY_VALIDATIONS_ALLOW_NO_ARD',
                'JAY_VALIDATIONS_ALLOW_NO_ERROR_PAGES',
            ].sort(),
        );
    });
});
