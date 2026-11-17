import { describe, it, expect } from 'vitest';
import { requireGithubRepoUrl } from '../lib/core/repo-url';
import { ShareError } from '../lib/core/types';
import { createSandbox } from './harness';
import { link } from '../lib/core/link';
import { publish } from '../lib/core/publish';

function codeOf(fn: () => unknown): string | undefined {
    try {
        fn();
        return undefined;
    } catch (e) {
        return e instanceof ShareError ? e.report.code : 'not-a-share-error';
    }
}

describe('repo URL validation (DL221)', () => {
    it.each([
        'https://github.com/acme/brand-ds',
        'https://github.com/acme/brand-ds.git',
        'git@github.com:acme/brand-ds.git',
        'ssh://git@github.com/acme/brand-ds.git',
    ])('accepts %s', (url) => {
        expect(requireGithubRepoUrl(url)).toEqual(url);
    });

    it.each([
        'https://gitlab.com/a/b.git',
        '/tmp/x.git',
        'github.com/a',
        'https://github.com/a',
        '',
    ])('rejects %s with SHARE_INVALID_REPO', (url) => {
        expect(codeOf(() => requireGithubRepoUrl(url))).toEqual('SHARE_INVALID_REPO');
    });

    it('rejects before any git call in link and publish', async () => {
        const sandbox = createSandbox();
        const ctx = sandbox.ctx();
        await expect(link(ctx, { repo: 'https://gitlab.com/a/b.git' })).rejects.toMatchObject({
            report: { code: 'SHARE_INVALID_REPO' },
        });
        await expect(publish(ctx, { plugin: 'x', repo: '/tmp/x.git' })).rejects.toMatchObject({
            report: { code: 'SHARE_INVALID_REPO' },
        });
        expect(sandbox.gitSpy).not.toHaveBeenCalled();
    });
});
