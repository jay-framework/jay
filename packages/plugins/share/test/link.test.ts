import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { link } from '../lib/core/link';
import { readManifest } from '../lib/core/manifest';
import { createSandbox, seedPluginRepo, REPO_URL, OTHER_REPO_URL, type Sandbox } from './harness';

const backups = (sandbox: Sandbox) =>
    fs.readdirSync(path.join(sandbox.site, '.jay-share', 'backup'));
const pluginsDir = (sandbox: Sandbox) => fs.readdirSync(path.join(sandbox.site, 'src', 'plugins'));

describe('share/link (DL221)', () => {
    it('clones main into src/plugins/<name>, pins it, ignores it and runs setup once', async () => {
        const sandbox = createSandbox();
        const sha = seedPluginRepo(sandbox, REPO_URL, 'main');
        const report = await link(sandbox.ctx(), { repo: REPO_URL });
        expect(report.ok).toEqual(true);
        expect(report.plugin).toEqual({
            name: 'brand-ds',
            folder: 'brand-ds',
            repo: REPO_URL,
            sha,
            shortSha: sha.slice(0, 7),
            contracts: ['card'],
            actions: [],
            routes: [],
            shadowedRoutes: [],
            hasServerCode: false,
            setup: 'none',
        });
        expect(readManifest(sandbox.site).plugins).toEqual([
            { folder: 'brand-ds', repo: REPO_URL, ref: 'main', commit: sha },
        ]);
        expect(sandbox.setupSpy.mock.calls).toEqual([[sandbox.site, 'brand-ds']]);
        expect(
            sandbox.git(
                ['status', '--porcelain', '--untracked-files=all', '--', 'src'],
                sandbox.site,
            ),
        ).toEqual('');
    });

    it('reports hasServerCode and shadowed routes for a plugin with code and a route', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL, 'main', 'with-code');
        fs.mkdirSync(path.join(sandbox.site, 'src/pages/gallery'), { recursive: true });
        fs.writeFileSync(
            path.join(sandbox.site, 'src/pages/gallery/page.jay-html'),
            '<html></html>',
        );
        const report = await link(sandbox.ctx(), { repo: REPO_URL });
        expect(report.plugin).toMatchObject({
            actions: ['brandDsHello'],
            routes: ['/gallery', '/brand-ds/about'],
            shadowedRoutes: ['/gallery'],
            hasServerCode: true,
        });
    });

    it('clones main, not the remote default branch, with a single-branch refspec', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL, 'main');
        seedPluginRepo(sandbox, REPO_URL, 'other');
        sandbox.git(['symbolic-ref', 'HEAD', 'refs/heads/other'], sandbox.bare(REPO_URL));
        await link(sandbox.ctx(), { repo: REPO_URL });
        const dir = path.join(sandbox.site, 'src/plugins/brand-ds');
        expect(sandbox.git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).toEqual('main');
        expect(sandbox.git(['config', '--get-all', 'remote.origin.fetch'], dir)).toEqual(
            '+refs/heads/main:refs/remotes/origin/main',
        );
    });

    it('links a named branch and records it as ref', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL, 'main', 'not-a-plugin');
        const sha = seedPluginRepo(sandbox, REPO_URL, 'brand-ds');
        await link(sandbox.ctx(), { repo: REPO_URL, ref: 'brand-ds' });
        expect(readManifest(sandbox.site).plugins).toEqual([
            { folder: 'brand-ds', repo: REPO_URL, ref: 'brand-ds', commit: sha },
        ]);
    });

    it('refuses a branch without a root plugin.yaml with SHARE_NOT_A_PLUGIN; clone kept in backup', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL, 'main', 'not-a-plugin');
        await expect(link(sandbox.ctx(), { repo: REPO_URL })).rejects.toMatchObject({
            report: {
                code: 'SHARE_NOT_A_PLUGIN',
                nextStep: `Pick the branch that holds the plugin: share/link --repo ${REPO_URL} --ref <branch>`,
            },
        });
        expect(pluginsDir(sandbox)).toEqual([]);
        expect(backups(sandbox)).toHaveLength(1);
    });

    it('links under --as with the cloned plugin.yaml byte-identical', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL);
        const report = await link(sandbox.ctx(), { repo: REPO_URL, as: 'ds2' });
        expect(report.plugin?.folder).toEqual('ds2');
        expect(sandbox.read('src/plugins/ds2/plugin.yaml')).toEqual(
            fs.readFileSync(path.join(__dirname, 'fixtures/brand-ds/plugin.yaml'), 'utf-8'),
        );
    });

    it('refuses a repo already in share.yaml with the existing folder in files', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL);
        await link(sandbox.ctx(), { repo: REPO_URL });
        fs.renameSync(
            path.join(sandbox.site, 'src/plugins/brand-ds'),
            path.join(sandbox.root, 'away'),
        );
        await expect(link(sandbox.ctx(), { repo: REPO_URL, as: 'x' })).rejects.toMatchObject({
            report: {
                code: 'SHARE_ALREADY_IN_MANIFEST',
                files: ['brand-ds'],
                nextStep: 'jay-stack run share/restore',
            },
        });
    });

    it('refuses an existing folder, leaving it untouched and the clone in backup', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL);
        const existing = path.join(sandbox.site, 'src/plugins/brand-ds');
        fs.mkdirSync(existing);
        fs.writeFileSync(path.join(existing, 'keep.txt'), 'mine');
        await expect(link(sandbox.ctx(), { repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_FOLDER_EXISTS' },
        });
        expect(fs.readdirSync(existing)).toEqual(['keep.txt']);
        expect(backups(sandbox)).toHaveLength(1);
    });

    it('refuses a plugin whose name is already installed, even with --as', async () => {
        const sandbox = createSandbox();
        sandbox.copyFixturePlugin('local-copy');
        seedPluginRepo(sandbox, REPO_URL);
        await expect(link(sandbox.ctx(), { repo: REPO_URL, as: 'ds2' })).rejects.toMatchObject({
            report: { code: 'SHARE_NAME_CLASH' },
        });
        expect(pluginsDir(sandbox)).toEqual(['local-copy']);
    });

    it('refuses a submodule path with SHARE_SUBMODULE', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL);
        fs.writeFileSync(
            path.join(sandbox.site, '.gitmodules'),
            '[submodule "x"]\n\tpath = src/plugins/brand-ds\n',
        );
        await expect(link(sandbox.ctx(), { repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_SUBMODULE' },
        });
    });

    it('refuses a folder the site repo tracks unless untrack is set', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, REPO_URL);
        sandbox.commitFile(sandbox.site, 'src/plugins/brand-ds/old.txt', 'old');
        fs.renameSync(
            path.join(sandbox.site, 'src/plugins/brand-ds'),
            path.join(sandbox.root, 'old-copy'),
        );
        await expect(link(sandbox.ctx(), { repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_TRACKED', files: ['src/plugins/brand-ds/old.txt'] },
        });
        const report = await link(sandbox.ctx(), { repo: REPO_URL, untrack: true });
        expect(report.ok).toEqual(true);
        expect(sandbox.git(['ls-files', 'src/plugins'], sandbox.site)).toEqual('');
    });

    it('rolls the folder back to backup when share.yaml cannot be written', async () => {
        const sandbox = createSandbox();
        seedPluginRepo(sandbox, OTHER_REPO_URL);
        seedPluginRepo(sandbox, REPO_URL);
        fs.writeFileSync(path.join(sandbox.site, 'share.yaml'), 'plugins: []\n', { mode: 0o444 });
        await expect(link(sandbox.ctx(), { repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_GIT_FAILED' },
        });
        expect(pluginsDir(sandbox)).toEqual([]);
        expect(backups(sandbox)).toHaveLength(1);
        expect(sandbox.setupSpy).not.toHaveBeenCalled();
    });

    it('maps a missing remote repo to SHARE_NO_ACCESS', async () => {
        const sandbox = createSandbox();
        const ctx = sandbox.ctx();
        const realRun = ctx.git.run;
        ctx.git.run = (args, cwd) =>
            realRun(
                args.map((a) => (a === REPO_URL ? path.join(sandbox.root, 'nope.git') : a)),
                cwd,
            );
        await expect(link(ctx, { repo: REPO_URL })).rejects.toMatchObject({
            report: { code: 'SHARE_NO_ACCESS' },
        });
    });
});
