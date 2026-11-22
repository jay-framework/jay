import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitRunner } from './git-runner';
import { shareFailure } from './types';
import { isCodeFile } from './denylist';
import type { IncomingFiles } from './types';

/** Local (non-network) git queries shared by the flows. */

export async function headSha(git: GitRunner, repoDir: string): Promise<string> {
    return git.run(['rev-parse', 'HEAD'], repoDir);
}

export async function dirtyFiles(git: GitRunner, repoDir: string): Promise<string[]> {
    const out = await git.run(['status', '--porcelain', '--untracked-files=all'], repoDir);
    return out
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3));
}

export async function requireClean(git: GitRunner, repoDir: string, folder: string): Promise<void> {
    const files = await dirtyFiles(git, repoDir);
    if (files.length === 0) return;
    throw shareFailure('SHARE_DIRTY', `src/plugins/${folder} has uncommitted changes.`, {
        files,
        nextStep: `Commit or stash the changes inside src/plugins/${folder}, then retry.`,
    });
}

export async function changedFiles(
    git: GitRunner,
    repoDir: string,
    range: string,
): Promise<string[]> {
    const out = await git.run(['diff', '--name-only', range], repoDir);
    return out.split('\n').filter(Boolean);
}

export function splitIncoming(files: string[]): IncomingFiles {
    return {
        codeFiles: files.filter(isCodeFile),
        otherFiles: files.filter((f) => !isCodeFile(f)),
    };
}

/** `[ahead, behind]` of HEAD relative to `upstream`. */
export async function aheadBehind(
    git: GitRunner,
    repoDir: string,
    upstream: string,
): Promise<[number, number]> {
    const out = await git.run(
        ['rev-list', '--left-right', '--count', `HEAD...${upstream}`],
        repoDir,
    );
    const [ahead, behind] = out.split(/\s+/).map(Number);
    return [ahead, behind];
}

export async function hasRef(git: GitRunner, repoDir: string, ref: string): Promise<boolean> {
    try {
        await git.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoDir);
        return true;
    } catch {
        return false;
    }
}

/** True when `projectRoot` is inside a git work tree (the site repo). */
export async function isSiteRepo(git: GitRunner, projectRoot: string): Promise<boolean> {
    try {
        return (await git.run(['rev-parse', '--is-inside-work-tree'], projectRoot)) === 'true';
    } catch {
        return false;
    }
}

/** Files the site repo tracks under `relDir` (POSIX, relative to the site repo root). */
export async function siteTrackedFiles(
    git: GitRunner,
    projectRoot: string,
    relDir: string,
): Promise<string[]> {
    if (!(await isSiteRepo(git, projectRoot))) return [];
    const out = await git.run(['ls-files', '--', relDir], projectRoot);
    return out.split('\n').filter(Boolean);
}

/** `relDir` is (or contains) a submodule of the site repo. */
export async function isSiteSubmodule(
    git: GitRunner,
    projectRoot: string,
    relDir: string,
): Promise<boolean> {
    const gitmodules = path.join(projectRoot, '.gitmodules');
    if (fs.existsSync(gitmodules) && fs.readFileSync(gitmodules, 'utf-8').includes(relDir))
        return true;
    if (!(await isSiteRepo(git, projectRoot))) return false;
    const out = await git.run(['ls-files', '-s', '--', relDir], projectRoot);
    return out.split('\n').some((line) => line.startsWith('160000 '));
}
