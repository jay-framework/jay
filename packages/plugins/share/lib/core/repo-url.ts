import { shareFailure } from './types';

const SEGMENT = '[A-Za-z0-9._-]+';
const GITHUB_REPO_FORMS = [
    new RegExp(`^https://github\\.com/${SEGMENT}/${SEGMENT}$`),
    new RegExp(`^git@github\\.com:${SEGMENT}/${SEGMENT}$`),
    new RegExp(`^ssh://git@github\\.com/${SEGMENT}/${SEGMENT}$`),
];
/** A browser address-bar URL of a branch: `https://github.com/<owner>/<name>/tree/<branch>`. */
const BROWSER_BRANCH_URL = new RegExp(`^(https://github\\.com/${SEGMENT}/${SEGMENT})/tree/(.+)$`);

export const ACCEPTED_REPO_FORMS = [
    'https://github.com/<owner>/<name>[.git]',
    'https://github.com/<owner>/<name>/tree/<branch>',
    'git@github.com:<owner>/<name>[.git]',
    'ssh://git@github.com/<owner>/<name>[.git]',
];

export interface GithubRepoLocation {
    repo: string;
    /** Only present when the URL names a branch (`/tree/<branch>`). */
    ref?: string;
}

/**
 * Normalizes any accepted GitHub URL form (checked before any git call): trims whitespace and a
 * trailing slash, and splits a browser `/tree/<branch>` URL into repo + ref.
 * Throws SHARE_INVALID_REPO for anything else.
 */
export function parseGithubRepoUrl(input: string | undefined): GithubRepoLocation {
    const candidate = (input ?? '').trim().replace(/\/+$/, '');
    const branchUrl = BROWSER_BRANCH_URL.exec(candidate);
    if (branchUrl) return { repo: branchUrl[1], ref: branchUrl[2] };
    if (GITHUB_REPO_FORMS.some((form) => form.test(candidate))) return { repo: candidate };
    throw shareFailure(
        'SHARE_INVALID_REPO',
        `"${(input ?? '').trim()}" is not a GitHub repository URL. Accepted forms: ${ACCEPTED_REPO_FORMS.join(', ')}.`,
        { nextStep: 'Create the repo on GitHub yourself and pass its URL with --repo.' },
    );
}

/** The normalized repo URL only (a `/tree/<branch>` part is dropped). */
export function requireGithubRepoUrl(repo: string | undefined): string {
    return parseGithubRepoUrl(repo).repo;
}

const OWNER_AND_NAME = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/;

/** True when two accepted URL forms point at the same GitHub repo (GitHub names ignore case). */
export function sameGithubRepo(first: string, second: string): boolean {
    const key = (url: string) => {
        const match = OWNER_AND_NAME.exec(requireGithubRepoUrl(url));
        return match ? `${match[1]}/${match[2]}`.toLowerCase() : url;
    };
    return key(first) === key(second);
}
