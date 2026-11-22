import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pull } from '../lib/core/pull';
import { readManifest } from '../lib/core/manifest';
import { linkedSite, REPO_URL } from './harness';

describe('share/pull (DL#237)', () => {
    it('fast-forwards, re-pins, splits incoming code and other files, runs setup once', async () => {
        const { sandbox, dir, sha } = await linkedSite();
        const teammate = sandbox.teammateClone(REPO_URL);
        fs.writeFileSync(path.join(teammate, 'card.ts'), 'export const x = 1;');
        fs.writeFileSync(path.join(teammate, 'card.css'), '.a{}');
        const newSha = sandbox.commitFile(teammate, 'agent-kit/guide.md', '# g');
        sandbox.git(['push', '--quiet', 'origin', 'main'], teammate);

        const report = await pull(sandbox.ctx(), { folder: 'brand-ds' });
        expect(report).toMatchObject({
            ok: true,
            localSha: sha,
            remoteSha: newSha,
            incoming: { codeFiles: ['agent-kit/guide.md', 'card.ts'], otherFiles: ['card.css'] },
        });
        expect(report.plugin?.sha).toEqual(newSha);
        expect(sandbox.git(['rev-parse', 'HEAD'], dir)).toEqual(newSha);
        expect(readManifest(sandbox.site).plugins[0].commit).toEqual(newSha);
        expect(sandbox.setupSpy.mock.calls).toEqual([[sandbox.site, 'brand-ds']]);
    });

    it('does not run setup when HEAD did not move', async () => {
        const { sandbox } = await linkedSite();
        const report = await pull(sandbox.ctx(), {});
        expect(report.incoming).toEqual({ codeFiles: [], otherFiles: [] });
        expect(sandbox.setupSpy).not.toHaveBeenCalled();
    });

    it('dryRun lists exactly HEAD..origin/<ref> and changes nothing', async () => {
        const { sandbox, dir, sha } = await linkedSite();
        const teammate = sandbox.teammateClone(REPO_URL);
        const newSha = sandbox.commitFile(teammate, 'lib/a.mts', 'export {}');
        sandbox.git(['push', '--quiet', 'origin', 'main'], teammate);
        const manifestBefore = sandbox.read('share.yaml');

        const report = await pull(sandbox.ctx(), { folder: 'brand-ds', dryRun: true });
        expect(report).toEqual({
            ok: true,
            message: 'Pull would bring 1 changed file(s) into 1 shared plugin(s).',
            files: [],
            incoming: { codeFiles: ['lib/a.mts'], otherFiles: [] },
            localSha: sha,
            remoteSha: newSha,
        });
        expect(sandbox.git(['rev-parse', 'HEAD'], dir)).toEqual(sha);
        expect(sandbox.read('share.yaml')).toEqual(manifestBefore);
        expect(sandbox.git(['status', '--porcelain'], dir)).toEqual('');
    });

    it('refuses a dirty folder with SHARE_DIRTY listing the files', async () => {
        const { sandbox, dir } = await linkedSite();
        fs.writeFileSync(path.join(dir, 'card.jay-html'), 'changed');
        await expect(pull(sandbox.ctx(), { folder: 'brand-ds' })).rejects.toMatchObject({
            report: { code: 'SHARE_DIRTY', files: ['card.jay-html'] },
        });
    });

    it('reports SHARE_DIVERGED with both SHAs and leaves share.yaml unchanged', async () => {
        const { sandbox, dir } = await linkedSite();
        const teammate = sandbox.teammateClone(REPO_URL);
        const remoteSha = sandbox.commitFile(teammate, 'remote.txt', 'r');
        sandbox.git(['push', '--quiet', 'origin', 'main'], teammate);
        const localSha = sandbox.commitFile(dir, 'local.txt', 'l');
        const manifestBefore = sandbox.read('share.yaml');
        await expect(pull(sandbox.ctx(), { folder: 'brand-ds' })).rejects.toMatchObject({
            report: { code: 'SHARE_DIVERGED', localSha, remoteSha },
        });
        expect(sandbox.read('share.yaml')).toEqual(manifestBefore);
    });

    it('refuses an unknown folder with SHARE_NOT_IN_MANIFEST', async () => {
        const { sandbox } = await linkedSite();
        await expect(pull(sandbox.ctx(), { folder: 'nope' })).rejects.toMatchObject({
            report: { code: 'SHARE_NOT_IN_MANIFEST', files: ['nope'] },
        });
    });

    it('tracks a linked non-main branch', async () => {
        const { sandbox, dir } = await linkedSite('brand-ds');
        const teammate = sandbox.teammateClone(REPO_URL, 'brand-ds');
        const newSha = sandbox.commitFile(teammate, 'x.css', '.x{}');
        sandbox.git(['push', '--quiet', 'origin', 'brand-ds'], teammate);
        await pull(sandbox.ctx(), {});
        expect(sandbox.git(['rev-parse', 'HEAD'], dir)).toEqual(newSha);
    });
});
