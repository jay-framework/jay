import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { discoverAllPluginActions } from '@jay-framework/stack-server-build';
import { ActionRegistry } from '@jay-framework/stack-server-runtime';
import { linkedSite, type Sandbox } from './harness';

const packageRoot = path.resolve(__dirname, '..');
const cli = path.resolve(packageRoot, '../../jay-stack/stack-cli/dist/index.js');
const ACTION_NAMES = [
    'shareLink',
    'sharePublish',
    'sharePull',
    'sharePush',
    'shareRestore',
    'shareStatus',
    'shareUnlink',
];

/** Installs the built share package into the sandbox site as an NPM dependency. */
function installShare(sandbox: Sandbox): void {
    fs.writeFileSync(
        path.join(sandbox.site, 'package.json'),
        JSON.stringify({
            name: 'site',
            private: true,
            dependencies: { '@jay-framework/share': '*' },
        }),
    );
    const scoped = path.join(sandbox.site, 'node_modules', '@jay-framework');
    fs.mkdirSync(scoped, { recursive: true });
    fs.symlinkSync(packageRoot, path.join(scoped, 'share'));
}

afterEach(() => vi.restoreAllMocks());

describe('share actions (DL221)', () => {
    it('declares 7 devOnly actions whose names equal their tools export names', async () => {
        const manifest = YAML.parse(
            fs.readFileSync(path.join(packageRoot, 'plugin.yaml'), 'utf-8'),
        );
        expect(
            manifest.actions
                .map((a: { name: string; devOnly: boolean }) => [a.name, a.devOnly])
                .sort(),
        ).toEqual(ACTION_NAMES.map((n) => [n, true]));
        const tools = await import('../lib/tools');
        expect(ACTION_NAMES.map((n) => (tools as Record<string, any>)[n]?.actionName)).toEqual(
            ACTION_NAMES,
        );
    });

    it('registers all 7 actions from ./tools; the serve entry exports nothing', async () => {
        const { sandbox } = await linkedSite();
        installShare(sandbox);
        const registry = new ActionRegistry();
        const registered = await discoverAllPluginActions({ projectRoot: sandbox.site, registry });
        expect(registered.filter((n) => n.startsWith('share')).sort()).toEqual(ACTION_NAMES);
        expect(Object.keys(await import(path.join(packageRoot, 'dist/index.js')))).toEqual([]);
    });

    it('executes shareStatus at the project root and returns a ShareReport', async () => {
        const { sandbox, sha } = await linkedSite();
        vi.spyOn(process, 'cwd').mockReturnValue(sandbox.site);
        const registry = new ActionRegistry();
        const tools = await import('../lib/tools');
        registry.register(tools.shareStatus as any);
        registry.register(tools.sharePull as any);

        const result = await registry.execute('shareStatus', {});
        expect(result).toMatchObject({
            success: true,
            data: { ok: true, plugins: [{ folder: 'brand-ds', pinnedSha: sha, fetched: false }] },
        });

        fs.writeFileSync(path.join(sandbox.site, 'src/plugins/brand-ds/card.jay-html'), 'dirty');
        const pulled = await registry.execute('sharePull', { folder: 'brand-ds' });
        expect(pulled).toMatchObject({
            success: true,
            data: { ok: false, code: 'SHARE_DIRTY', files: ['card.jay-html'] },
        });
    });
});

describe('share CLI commands (DL221)', () => {
    function run(sandbox: Sandbox, args: string[]) {
        return spawnSync(process.execPath, [cli, 'run', ...args], {
            cwd: sandbox.site,
            env: { ...process.env, ...sandbox.env },
            encoding: 'utf-8',
        });
    }

    it('exits 0 on an ok report and 1 otherwise', async () => {
        const { sandbox } = await linkedSite();
        installShare(sandbox);
        const ok = run(sandbox, ['share/status']);
        const failed = run(sandbox, ['share/pull', '--folder', 'nope']);
        expect({ ok: ok.status, failed: failed.status }).toEqual({ ok: 0, failed: 1 });
        expect((failed.stdout + failed.stderr).includes('SHARE_NOT_IN_MANIFEST')).toEqual(true);
    });
});
