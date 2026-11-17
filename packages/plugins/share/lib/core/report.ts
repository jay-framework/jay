import { GitCommandError } from './git-runner';
import { ShareError, shareFailure, type ShareErrorCode, type ShareReport } from './types';

/** Which network step failed — push stderr has extra meanings (DL#221 § "No prompts, ever"). */
export type GitNetworkStep = 'clone' | 'fetch' | 'ls-remote' | 'push' | 'publish-first-push';

const NO_ACCESS_PATTERNS = [
    'permission denied (publickey',
    'the requested url returned error: 403',
    'repository not found',
    'could not read username',
    'does not appear to be a git repository',
    'host key verification failed',
];

/** git's wording for a clone source that does not exist (e.g. a test bare repo path). */
const MISSING_REPO = /repository '[^']*' does not exist/;

const OFFLINE_PATTERNS = [
    'could not resolve host',
    'failed to connect',
    'network is unreachable',
    'connection timed out',
    'connection refused',
    'operation timed out',
];

export function classifyGitStderr(stderr: string, step: GitNetworkStep): ShareErrorCode {
    const text = stderr.toLowerCase();
    const isPush = step === 'push' || step === 'publish-first-push';
    if (isPush && (stderr.includes('GH006') || text.includes('protected branch'))) {
        return 'SHARE_BRANCH_PROTECTED';
    }
    if (NO_ACCESS_PATTERNS.some((p) => text.includes(p)) || MISSING_REPO.test(text))
        return 'SHARE_NO_ACCESS';
    if (OFFLINE_PATTERNS.some((p) => text.includes(p))) return 'SHARE_OFFLINE';
    if (isPush && text.includes('[remote rejected]')) return 'SHARE_NO_ACCESS';
    if (
        step === 'publish-first-push' &&
        text.includes('[rejected]') &&
        (text.includes('fetch first') || text.includes('non-fast-forward'))
    ) {
        return 'SHARE_BRANCH_NOT_EMPTY';
    }
    return 'SHARE_GIT_FAILED';
}

const NEXT_STEPS: Partial<Record<ShareErrorCode, string>> = {
    SHARE_NO_ACCESS:
        'Check that the repo exists and that your git credentials (ssh key or credential helper) can reach it, then retry.',
    SHARE_OFFLINE: 'Check your network connection, then retry.',
    SHARE_BRANCH_PROTECTED:
        'The branch is protected: push a branch with plain git inside the plugin folder and open a PR; after merge, sites run share/pull.',
};

const STALLED_NEXT_STEP =
    'Use the SSH URL (git@github.com:<owner>/<name>.git) if your ssh key has access, or make sure ' +
    'git can reach the HTTPS URL from a terminal without asking for credentials, then retry.';

/** Turns a failed network git call into a ShareError with the classified code. */
export function networkFailure(error: unknown, step: GitNetworkStep, context: string): ShareError {
    if (error instanceof ShareError) return error;
    const stderr = error instanceof GitCommandError ? error.stderr : String(error);
    if (error instanceof GitCommandError && error.timedOut) {
        return shareFailure('SHARE_NO_ACCESS', `${context}: ${stderr.trim()}`, {
            nextStep: STALLED_NEXT_STEP,
        });
    }
    const code = classifyGitStderr(stderr, step);
    return shareFailure(code, `${context}: ${stderr.trim()}`, { nextStep: NEXT_STEPS[code] });
}

/** Any thrown value as a ShareReport — the only shape callers ever see. */
export function toReport(error: unknown): ShareReport {
    if (error instanceof ShareError) return error.report;
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: 'SHARE_GIT_FAILED', message, files: [] };
}
