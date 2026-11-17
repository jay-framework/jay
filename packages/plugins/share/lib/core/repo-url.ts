import { shareFailure } from './types';

const SEGMENT = '[A-Za-z0-9._-]+';
const GITHUB_REPO_FORMS = [
    new RegExp(`^https://github\\.com/${SEGMENT}/${SEGMENT}$`),
    new RegExp(`^git@github\\.com:${SEGMENT}/${SEGMENT}$`),
    new RegExp(`^ssh://git@github\\.com/${SEGMENT}/${SEGMENT}$`),
];

export const ACCEPTED_REPO_FORMS = [
    'https://github.com/<owner>/<name>[.git]',
    'git@github.com:<owner>/<name>[.git]',
    'ssh://git@github.com/<owner>/<name>[.git]',
];

/** Throws SHARE_INVALID_REPO unless `repo` is one of the GitHub URL forms (checked before any git call). */
export function requireGithubRepoUrl(repo: string | undefined): string {
    const candidate = (repo ?? '').trim();
    if (GITHUB_REPO_FORMS.some((form) => form.test(candidate))) return candidate;
    throw shareFailure(
        'SHARE_INVALID_REPO',
        `"${candidate}" is not a GitHub repository URL. Accepted forms: ${ACCEPTED_REPO_FORMS.join(', ')}.`,
        { nextStep: 'Create the repo on GitHub yourself and pass its URL with --repo.' },
    );
}
