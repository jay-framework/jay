import { describe, it, expect } from 'vitest';
import { parseGithubRepoUrl, requireGithubRepoUrl, sameGithubRepo } from '../lib/core/repo-url';
import { ShareError } from '../lib/core/types';
import { createSandbox, seedPluginRepo } from './harness';
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

describe('repo URL validation (DL#237)', () => {
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

/**
 * Bug: the Share / Import dialogs rejected or mis-handled GitHub URLs copied from the browser.
 * Found in: DL#237 / aiditor QA (2026-11-17) — product owner request.
 * Expected: browser URLs (trailing slash, `/tree/<branch>`), HTTPS clone URLs and SSH URLs all
 * normalize to a clean repo URL; `/tree/<branch>` also yields the branch.
 * Actual: a trailing slash or `/tree/<branch>` failed SHARE_INVALID_REPO.
 */
describe('GitHub URL normalization (DL#237 QA)', () => {
    it.each([
        ['https://github.com/acme/brand-ds', 'https://github.com/acme/brand-ds'],
        ['https://github.com/acme/brand-ds/', 'https://github.com/acme/brand-ds'],
        ['https://github.com/acme/brand-ds.git', 'https://github.com/acme/brand-ds.git'],
        ['https://github.com/acme/brand-ds.git/', 'https://github.com/acme/brand-ds.git'],
        ['  git@github.com:acme/brand-ds.git ', 'git@github.com:acme/brand-ds.git'],
        ['ssh://git@github.com/acme/brand-ds.git', 'ssh://git@github.com/acme/brand-ds.git'],
    ])('normalizes %s', (input, repo) => {
        expect(parseGithubRepoUrl(input)).toEqual({ repo });
        expect(requireGithubRepoUrl(input)).toEqual(repo);
    });

    it.each([
        ['https://github.com/acme/brand-ds/tree/qa-1', 'qa-1'],
        ['https://github.com/acme/brand-ds/tree/qa-1/', 'qa-1'],
        ['https://github.com/acme/brand-ds/tree/feature/new-buttons', 'feature/new-buttons'],
    ])('takes the branch from a browser URL %s', (input, ref) => {
        expect(parseGithubRepoUrl(input)).toEqual({
            repo: 'https://github.com/acme/brand-ds',
            ref,
        });
    });

    it.each([
        'https://github.com/acme/brand-ds/blob/main/x.ts',
        'https://github.com/acme/brand-ds/tree/',
    ])('rejects a non-repo page %s', (input) => {
        expect(codeOf(() => parseGithubRepoUrl(input))).toEqual('SHARE_INVALID_REPO');
    });

    it('links the branch named in a /tree/<branch> URL', async () => {
        const sandbox = createSandbox();
        const base = 'https://github.com/acme/brand-ds';
        seedPluginRepo(sandbox, base, 'qa-1');
        const report = await link(sandbox.ctx(), { repo: `${base}/tree/qa-1` });
        expect(report.ok).toEqual(true);
        expect(report.plugin?.repo).toEqual(base);
    });
});

/**
 * Bug: the same GitHub repo imported again through another URL form was not caught.
 * Found in: DL#237 QA follow-up (HTTPS / SSH / browser URL forms are all accepted now).
 * Expected: link answers SHARE_ALREADY_IN_MANIFEST for any URL form of a linked repo.
 * Actual: the manifest check compared URL strings exactly.
 */
describe('same repo, other URL form (DL#237 QA)', () => {
    it('refuses to link a repo that is already linked under another URL form', async () => {
        const sandbox = createSandbox();
        const https = 'https://github.com/acme/brand-ds.git';
        seedPluginRepo(sandbox, https, 'main');
        await link(sandbox.ctx(), { repo: https });
        await expect(
            link(sandbox.ctx(), { repo: 'git@github.com:Acme/brand-ds.git' }),
        ).rejects.toMatchObject({
            report: { code: 'SHARE_ALREADY_IN_MANIFEST', files: ['brand-ds'] },
        });
    });

    it.each([
        ['https://github.com/acme/brand-ds', 'git@github.com:acme/brand-ds.git', true],
        ['https://github.com/acme/brand-ds.git', 'ssh://git@github.com/ACME/brand-ds', true],
        ['https://github.com/acme/brand-ds', 'https://github.com/acme/brand-ds-2', false],
    ])('sameGithubRepo(%s, %s) = %s', (a, b, same) => {
        expect(sameGithubRepo(a, b)).toEqual(same);
    });
});
