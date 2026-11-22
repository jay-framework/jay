import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { publish } from '../lib/core/publish';
import { readManifest } from '../lib/core/manifest';
import {
    createSandbox,
    remoteBranchSha,
    remoteRefs,
    seedPluginRepo,
    REPO_URL,
    type Sandbox,
} from './harness';

function sharedSite(): Sandbox {
    const sandbox = createSandbox();
    sandbox.copyFixturePlugin('brand-ds');
    sandbox.bare(REPO_URL);
    return sandbox;
}

const pushCalls = (sandbox: Sandbox) =>
    sandbox.gitSpy.mock.calls.filter(([args]) => args[0] === 'push');

describe('share/publish (DL#237)', () => {
    it('publishes an existing local plugin to an empty repo on main', async () => {
        const sandbox = sharedSite();
        const report = await publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL });
        const sha = remoteBranchSha(sandbox, REPO_URL, 'main');
        expect(report.ok).toEqual(true);
        expect(readManifest(sandbox.site)).toEqual({
            plugins: [{ folder: 'brand-ds', repo: REPO_URL, ref: 'main', commit: sha }],
        });
        expect(sandbox.read('.gitignore')).toEqual(
            '# >>> jay share\n/.jay-share/\n/src/plugins/brand-ds/\n# <<< jay share\n',
        );
        expect(sandbox.read('src/plugins/brand-ds/.gitignore').split('\n').slice(0, 2)).toEqual([
            '.*',
            '!.gitignore',
        ]);
        expect(report.plugin).toMatchObject({
            name: 'brand-ds',
            folder: 'brand-ds',
            sha,
            contracts: ['card'],
            hasServerCode: false,
        });
    });

    it('publishes to a new branch of a non-empty repo, leaving other branches untouched', async () => {
        const sandbox = sharedSite();
        seedPluginRepo(sandbox, REPO_URL, 'main');
        const before = remoteBranchSha(sandbox, REPO_URL, 'main');
        const report = await publish(sandbox.ctx(), {
            plugin: 'brand-ds',
            repo: REPO_URL,
            branch: 'brand-ds',
        });
        expect(report.ok).toEqual(true);
        expect(remoteBranchSha(sandbox, REPO_URL, 'main')).toEqual(before);
        const files = sandbox.git(
            ['ls-tree', '--name-only', 'refs/heads/brand-ds'],
            sandbox.bare(REPO_URL),
        );
        expect(files.split('\n')).toEqual([
            '.gitignore',
            'card.jay-contract',
            'card.jay-html',
            'plugin.yaml',
        ]);
        expect(readManifest(sandbox.site).plugins[0].ref).toEqual('brand-ds');
    });

    it('refuses an existing branch with SHARE_BRANCH_NOT_EMPTY and changes nothing', async () => {
        const sandbox = sharedSite();
        seedPluginRepo(sandbox, REPO_URL, 'main');
        const refs = remoteRefs(sandbox, REPO_URL);
        await expect(
            publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL }),
        ).rejects.toMatchObject({
            report: { code: 'SHARE_BRANCH_NOT_EMPTY', files: [] },
        });
        expect(remoteRefs(sandbox, REPO_URL)).toEqual(refs);
        expect(fs.existsSync(path.join(sandbox.site, 'share.yaml'))).toEqual(false);
        expect(fs.existsSync(path.join(sandbox.site, 'src/plugins/brand-ds/.git'))).toEqual(false);
    });

    it('maps a branch that appears between ls-remote and push to SHARE_BRANCH_NOT_EMPTY', async () => {
        const sandbox = sharedSite();
        const ctx = sandbox.ctx();
        const realRun = ctx.git.run;
        ctx.git = {
            ...ctx.git,
            run: async (args, cwd) => {
                if (args[0] === 'push') seedPluginRepo(sandbox, REPO_URL, 'main');
                return realRun(args, cwd);
            },
        };
        await expect(publish(ctx, { plugin: 'brand-ds', repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_BRANCH_NOT_EMPTY' },
        });
        expect(fs.existsSync(path.join(sandbox.site, 'share.yaml'))).toEqual(false);
        expect(fs.existsSync(path.join(sandbox.site, 'src/plugins/brand-ds/.git'))).toEqual(false);
    });

    it('maps a hook-rejected branch creation to SHARE_NO_ACCESS', async () => {
        const sandbox = sharedSite();
        const hook = path.join(sandbox.bare(REPO_URL), 'hooks', 'pre-receive');
        fs.writeFileSync(hook, '#!/bin/sh\necho "branch creation blocked" >&2\nexit 1\n', {
            mode: 0o755,
        });
        await expect(
            publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL }),
        ).rejects.toMatchObject({
            report: { code: 'SHARE_NO_ACCESS' },
        });
        expect(fs.existsSync(path.join(sandbox.site, 'share.yaml'))).toEqual(false);
    });

    it('resumes after a successful push when the share.yaml write failed', async () => {
        const sandbox = sharedSite();
        const manifestFile = path.join(sandbox.site, 'share.yaml');
        fs.writeFileSync(manifestFile, 'plugins: []\n', { mode: 0o444 }); // read-only: the write fails
        await expect(
            publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL }),
        ).rejects.toMatchObject({
            report: { code: 'SHARE_GIT_FAILED' },
        });
        expect(pushCalls(sandbox)).toHaveLength(1);
        fs.chmodSync(manifestFile, 0o644);

        sandbox.gitSpy.mockClear();
        const retry = await publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL });
        expect(retry.ok).toEqual(true);
        expect(pushCalls(sandbox)).toHaveLength(0);
        const afterFirstRetry = {
            manifest: sandbox.read('share.yaml'),
            ignore: sandbox.read('.gitignore'),
        };

        await publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL });
        expect({
            manifest: sandbox.read('share.yaml'),
            ignore: sandbox.read('.gitignore'),
        }).toEqual(afterFirstRetry);
        expect(readManifest(sandbox.site).plugins).toHaveLength(1);
    });

    it.each(['.env', '.vscode/settings.json', 'src/.secret', 'certs/dev.pem'])(
        'refuses a force-added %s with SHARE_SECRET_FOUND and leaves the remote empty',
        async (secret) => {
            const sandbox = sharedSite();
            const dir = path.join(sandbox.site, 'src/plugins/brand-ds');
            fs.mkdirSync(path.dirname(path.join(dir, secret)), { recursive: true });
            fs.writeFileSync(path.join(dir, secret), 'TOKEN=1');
            const ctx = sandbox.ctx();
            const realRun = ctx.git.run;
            ctx.git = {
                ...ctx.git,
                run: async (args, cwd) => {
                    const out = await realRun(args, cwd);
                    if (args[0] === 'add') await realRun(['add', '-f', secret], cwd);
                    return out;
                },
            };
            await expect(
                publish(ctx, { plugin: 'brand-ds', repo: REPO_URL }),
            ).rejects.toMatchObject({
                report: { code: 'SHARE_SECRET_FOUND', files: [secret] },
            });
            expect(remoteRefs(sandbox, REPO_URL)).toEqual('');
        },
    );

    it('refuses when validate-plugin --local fails', async () => {
        const sandbox = sharedSite();
        const ctx = sandbox.ctx({
            validateLocalPlugins: vi.fn(async () => ['card: contract missing']),
        });
        await expect(publish(ctx, { plugin: 'brand-ds', repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_VALIDATE_FAILED' },
        });
        expect(remoteRefs(sandbox, REPO_URL)).toEqual('');
    });

    it('requires untrack for a plugin the site repo tracks, then untracks it', async () => {
        const sandbox = sharedSite();
        sandbox.git(['add', '-A'], sandbox.site);
        sandbox.git(['commit', '--quiet', '-m', 'local plugin'], sandbox.site);
        await expect(
            publish(sandbox.ctx(), { plugin: 'brand-ds', repo: REPO_URL }),
        ).rejects.toMatchObject({
            report: { code: 'SHARE_TRACKED' },
        });
        const report = await publish(sandbox.ctx(), {
            plugin: 'brand-ds',
            repo: REPO_URL,
            untrack: true,
        });
        expect(report.ok).toEqual(true);
        expect(sandbox.git(['ls-files', 'src/plugins/brand-ds'], sandbox.site)).toEqual('');
        const siteStatus = sandbox.git(
            ['status', '--porcelain', '--untracked-files=all', '--', 'src/plugins'],
            sandbox.site,
        );
        // Staged removals for the site commit; nothing under the shared folder shows as untracked.
        expect(siteStatus.split('\n').filter((l) => !l.startsWith('D  '))).toEqual([]);
    });

    it('maps an unreachable repo to SHARE_NO_ACCESS without prompting', async () => {
        const sandbox = createSandbox();
        sandbox.copyFixturePlugin('brand-ds');
        const ctx = sandbox.ctx();
        ctx.git = { ...ctx.git, resolveUrl: (u) => u };
        const missing = path.join(sandbox.root, 'missing.git');
        const realRun = ctx.git.run;
        ctx.git.run = (args, cwd) =>
            realRun(
                args.map((a) => (a === REPO_URL ? missing : a)),
                cwd,
            );
        await expect(publish(ctx, { plugin: 'brand-ds', repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_NO_ACCESS' },
        });
    });
});
