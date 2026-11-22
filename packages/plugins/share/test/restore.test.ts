import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { restore } from '../lib/core/restore';
import { pull } from '../lib/core/pull';
import { readManifest, writeManifest } from '../lib/core/manifest';
import { linkedSite, REPO_URL, OTHER_REPO_URL } from './harness';

describe('share/restore (DL#237)', () => {
    it('restores a missing folder at the pinned commit on branch <ref>, then pull works', async () => {
        const { sandbox, dir, sha } = await linkedSite();
        fs.renameSync(dir, path.join(sandbox.root, 'gone'));
        const teammate = sandbox.teammateClone(REPO_URL);
        const newer = sandbox.commitFile(teammate, 'n.css', '.n{}');
        sandbox.git(['push', '--quiet', 'origin', 'main'], teammate);

        const report = await restore(sandbox.ctx());
        expect(report.ok).toEqual(true);
        expect(sandbox.git(['rev-parse', 'HEAD'], dir)).toEqual(sha);
        expect(sandbox.git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).toEqual('main');
        expect(sandbox.setupSpy.mock.calls).toEqual([[sandbox.site, 'brand-ds']]);

        await pull(sandbox.ctx(), {});
        expect(sandbox.git(['rev-parse', 'HEAD'], dir)).toEqual(newer);
    });

    it('restores the reachable entries and reports the inaccessible one', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.renameSync(dir, path.join(sandbox.root, 'gone'));
        const manifest = readManifest(sandbox.site);
        writeManifest(sandbox.site, {
            plugins: [
                ...manifest.plugins,
                { folder: 'other', repo: OTHER_REPO_URL, ref: 'main', commit: 'abc' },
            ],
        });
        const ctx = sandbox.ctx();
        const realRun = ctx.git.run;
        ctx.git.run = (args, cwd) =>
            realRun(
                args.map((a) => (a === OTHER_REPO_URL ? path.join(sandbox.root, 'nope.git') : a)),
                cwd,
            );

        const report = await restore(ctx);
        expect(report).toMatchObject({ ok: false, code: 'SHARE_NO_ACCESS', files: ['other'] });
        expect(fs.existsSync(dir)).toEqual(true);
        expect(report.plugins?.map((p) => [p.folder, p.present])).toEqual([
            ['brand-ds', true],
            ['other', false],
        ]);
    });

    it('reports SHARE_COMMIT_MISSING when the pinned commit is gone from the remote', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.renameSync(dir, path.join(sandbox.root, 'gone'));
        const manifest = readManifest(sandbox.site);
        writeManifest(sandbox.site, {
            plugins: [{ ...manifest.plugins[0], commit: '1'.repeat(40) }],
        });
        const report = await restore(sandbox.ctx());
        expect(report).toMatchObject({
            ok: false,
            code: 'SHARE_COMMIT_MISSING',
            files: ['brand-ds'],
        });
        expect(fs.existsSync(dir)).toEqual(false);
    });
});
