import { describe, it, expect } from 'vitest';
import { classifyGitStderr } from '../lib/core/report';

describe('git stderr classification (DL221)', () => {
    it.each([
        ['git@github.com: Permission denied (publickey).', 'SHARE_NO_ACCESS'],
        ['fatal: unable to access: The requested URL returned error: 403', 'SHARE_NO_ACCESS'],
        ['ERROR: Repository not found.', 'SHARE_NO_ACCESS'],
        [
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
            'SHARE_NO_ACCESS',
        ],
        ["fatal: '/x' does not appear to be a git repository", 'SHARE_NO_ACCESS'],
        ['Host key verification failed.', 'SHARE_NO_ACCESS'],
        ["fatal: repository '/tmp/nope.git' does not exist", 'SHARE_NO_ACCESS'],
        ['fatal: unable to access: Could not resolve host: github.com', 'SHARE_OFFLINE'],
        ['error: cannot open .git/FETCH_HEAD: Permission denied', 'SHARE_GIT_FAILED'],
    ])('fetch: %s → %s', (stderr, code) => {
        expect(classifyGitStderr(stderr, 'fetch')).toEqual(code);
    });

    it('maps GH006 and "protected branch" on push to SHARE_BRANCH_PROTECTED', () => {
        expect(
            classifyGitStderr('remote: error: GH006: Protected branch update failed', 'push'),
        ).toEqual('SHARE_BRANCH_PROTECTED');
        expect(
            classifyGitStderr(
                ' ! [remote rejected] main -> main (protected branch hook declined)',
                'push',
            ),
        ).toEqual('SHARE_BRANCH_PROTECTED');
    });

    it('does not map "protected branch" outside push', () => {
        expect(classifyGitStderr('protected branch', 'fetch')).toEqual('SHARE_GIT_FAILED');
    });

    it('maps [remote rejected] without GH006 to SHARE_NO_ACCESS on every push', () => {
        const stderr = ' ! [remote rejected] x -> x (pre-receive hook declined)';
        expect(classifyGitStderr(stderr, 'push')).toEqual('SHARE_NO_ACCESS');
        expect(classifyGitStderr(stderr, 'publish-first-push')).toEqual('SHARE_NO_ACCESS');
    });

    it('maps a rejected first publish push (fetch first) to SHARE_BRANCH_NOT_EMPTY only on publish', () => {
        const stderr = ' ! [rejected]        HEAD -> brand-ds (fetch first)';
        expect(classifyGitStderr(stderr, 'publish-first-push')).toEqual('SHARE_BRANCH_NOT_EMPTY');
        expect(classifyGitStderr(stderr, 'push')).toEqual('SHARE_GIT_FAILED');
    });
});
