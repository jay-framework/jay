import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { push } from '../lib/core/push';
import { readManifest } from '../lib/core/manifest';
import { linkedSite, remoteBranchSha, REPO_URL } from './harness';

describe('share/push (DL#237)', () => {
    it('pushes local commits fast-forward, re-pins, and lists outgoing files', async () => {
        const { sandbox, dir } = await linkedSite();
        const localSha = sandbox.commitFile(dir, 'card.css', '.c{}');
        const report = await push(sandbox.ctx(), { folder: 'brand-ds' });
        expect(report).toMatchObject({
            ok: true,
            files: ['card.css'],
            localSha,
            remoteSha: localSha,
        });
        expect(remoteBranchSha(sandbox, REPO_URL, 'main')).toEqual(localSha);
        expect(readManifest(sandbox.site).plugins[0].commit).toEqual(localSha);
    });

    it('refuses uncommitted changes with SHARE_DIRTY; remote unchanged', async () => {
        const { sandbox, dir, sha } = await linkedSite();
        fs.writeFileSync(path.join(dir, 'new.css'), '.n{}');
        await expect(push(sandbox.ctx(), {})).rejects.toMatchObject({
            report: { code: 'SHARE_DIRTY', files: ['new.css'] },
        });
        expect(remoteBranchSha(sandbox, REPO_URL, 'main')).toEqual(sha);
    });

    it('reports SHARE_DIVERGED, never force-pushes, and succeeds after a rebase', async () => {
        const { sandbox, dir } = await linkedSite();
        const teammate = sandbox.teammateClone(REPO_URL);
        const remoteSha = sandbox.commitFile(teammate, 'remote.txt', 'r');
        sandbox.git(['push', '--quiet', 'origin', 'main'], teammate);
        const localSha = sandbox.commitFile(dir, 'local.txt', 'l');
        const manifestBefore = sandbox.read('share.yaml');

        await expect(push(sandbox.ctx(), { folder: 'brand-ds' })).rejects.toMatchObject({
            report: { code: 'SHARE_DIVERGED', localSha, remoteSha },
        });
        expect(remoteBranchSha(sandbox, REPO_URL, 'main')).toEqual(remoteSha);
        expect(sandbox.read('share.yaml')).toEqual(manifestBefore);

        sandbox.git(['pull', '--quiet', '--rebase', 'origin', 'main'], dir);
        const report = await push(sandbox.ctx(), { folder: 'brand-ds' });
        const rebased = sandbox.git(['rev-parse', 'HEAD'], dir);
        expect(report.ok).toEqual(true);
        expect(readManifest(sandbox.site).plugins[0].commit).toEqual(rebased);
        const pushArgs = sandbox.gitSpy.mock.calls.filter(([a]) => a[0] === 'push').map(([a]) => a);
        expect(pushArgs.some((a) => a.includes('--force') || a.includes('-f'))).toEqual(false);
    });

    it.each(['.env', 'config/secrets.yaml', 'keys/id_rsa'])(
        'refuses an outgoing %s with SHARE_SECRET_FOUND',
        async (secret) => {
            const { sandbox, dir, sha } = await linkedSite();
            fs.mkdirSync(path.dirname(path.join(dir, secret)), { recursive: true });
            fs.writeFileSync(path.join(dir, secret), 'x');
            sandbox.git(['add', '-f', secret], dir);
            sandbox.git(['commit', '--quiet', '-m', 'oops'], dir);
            await expect(push(sandbox.ctx(), {})).rejects.toMatchObject({
                report: { code: 'SHARE_SECRET_FOUND', files: [secret] },
            });
            expect(remoteBranchSha(sandbox, REPO_URL, 'main')).toEqual(sha);
        },
    );

    it('maps a protected-branch rejection to SHARE_BRANCH_PROTECTED with share.yaml unchanged', async () => {
        const { sandbox, dir } = await linkedSite();
        const hook = path.join(sandbox.bare(REPO_URL), 'hooks', 'pre-receive');
        fs.writeFileSync(
            hook,
            '#!/bin/sh\necho "GH006: Protected branch update failed for refs/heads/main." >&2\nexit 1\n',
            { mode: 0o755 },
        );
        sandbox.commitFile(dir, 'a.css', '.a{}');
        const manifestBefore = sandbox.read('share.yaml');
        const failure = await push(sandbox.ctx(), {}).catch((e) => e.report);
        expect(failure.code).toEqual('SHARE_BRANCH_PROTECTED');
        expect(failure.nextStep).toMatch(/push a branch with plain git .* open a PR/);
        expect(sandbox.read('share.yaml')).toEqual(manifestBefore);
    });
});
