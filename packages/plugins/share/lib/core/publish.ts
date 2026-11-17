import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShareContext } from './context';
import {
    DEFAULT_REF,
    pluginFolderPath,
    readManifest,
    upsertEntry,
    type ShareEntry,
} from './manifest';
import { requireGithubRepoUrl } from './repo-url';
import { networkFailure } from './report';
import { requireNoDeniedPaths, writePluginGitignore } from './denylist';
import { checkSiteRepoAllowsSharing, ignoreSharedFolder } from './site-guards';
import { moveToBackup } from './scratch';
import { headSha } from './git-queries';
import { readPluginYaml, summarizePlugin } from './plugin-summary';
import { shareFailure, ShareError, type ShareReport } from './types';

export interface PublishInput {
    plugin: string;
    repo: string;
    branch?: string;
    untrack?: boolean;
}

/**
 * `share/publish` (DL#221 § Flows): push an existing local plugin, as its own history, to a new
 * branch of an existing GitHub repo. Never creates repos, never force-pushes. Resumable: a retry
 * after a successful push only writes the share.yaml entry + ignore block.
 */
export async function publish(ctx: ShareContext, input: PublishInput): Promise<ShareReport> {
    const repo = requireGithubRepoUrl(input.repo);
    const branch = input.branch || DEFAULT_REF;
    const folder = input.plugin;
    const dir = requireLocalPlugin(ctx.projectRoot, folder);
    const remoteBranchSha = await lsRemoteBranch(ctx, repo, branch);

    const resuming = await isPublishedAlready(ctx, dir, repo, remoteBranchSha);
    if (!resuming) {
        requireBranchIsNew(repo, branch, remoteBranchSha);
        requireFolderNotShared(ctx.projectRoot, folder);
    }
    const tracked = await checkSiteRepoAllowsSharing(ctx, folder, !!input.untrack);
    if (!resuming) {
        await requireValidPlugins(ctx);
        await commitAndPushNewBranch(ctx, { dir, folder, repo, branch });
    }
    return recordPublished(ctx, { folder, repo, ref: branch }, tracked);
}

function requireLocalPlugin(projectRoot: string, folder: string): string {
    const dir = pluginFolderPath(projectRoot, folder);
    if (!readPluginYaml(dir)) {
        throw shareFailure(
            'SHARE_NOT_A_PLUGIN',
            `src/plugins/${folder} is not a local plugin (no plugin.yaml).`,
            {
                files: [`src/plugins/${folder}`],
                nextStep:
                    'Pass the folder name of an existing local plugin under src/plugins with --plugin.',
            },
        );
    }
    return dir;
}

/** SHA of `refs/heads/<branch>` on the remote, or '' when the branch does not exist. */
async function lsRemoteBranch(ctx: ShareContext, repo: string, branch: string): Promise<string> {
    try {
        const out = await ctx.git.run(['ls-remote', repo, `refs/heads/${branch}`], ctx.projectRoot);
        return out.split(/\s+/)[0] ?? '';
    } catch (error) {
        throw networkFailure(error, 'ls-remote', `Could not reach ${repo}`);
    }
}

/** Resume check: the folder's own repo already points at `repo` and the branch is at its HEAD. */
async function isPublishedAlready(
    ctx: ShareContext,
    dir: string,
    repo: string,
    remoteBranchSha: string,
): Promise<boolean> {
    if (!remoteBranchSha || !fs.existsSync(path.join(dir, '.git'))) return false;
    try {
        const origin = await ctx.git.run(['remote', 'get-url', 'origin'], dir);
        return (
            origin === ctx.git.resolveUrl(repo) && (await headSha(ctx.git, dir)) === remoteBranchSha
        );
    } catch {
        return false;
    }
}

function requireBranchIsNew(repo: string, branch: string, remoteBranchSha: string): void {
    if (!remoteBranchSha) return;
    throw branchNotEmpty(repo, branch);
}

function branchNotEmpty(repo: string, branch: string): ShareError {
    return shareFailure('SHARE_BRANCH_NOT_EMPTY', `Branch "${branch}" already exists in ${repo}.`, {
        nextStep: `Publish to a new branch (--branch <new-branch>), or if it already holds this plugin: share/link --repo ${repo} --ref ${branch}`,
    });
}

function requireFolderNotShared(projectRoot: string, folder: string): void {
    if (!readManifest(projectRoot).plugins.some((e) => e.folder === folder)) return;
    throw shareFailure(
        'SHARE_ALREADY_IN_MANIFEST',
        `"${folder}" is already shared in share.yaml.`,
        {
            files: [folder],
            nextStep: `jay-stack run share/push --folder ${folder}`,
        },
    );
}

async function requireValidPlugins(ctx: ShareContext): Promise<void> {
    const errors = await ctx.validateLocalPlugins(ctx.projectRoot);
    if (errors.length === 0) return;
    throw shareFailure(
        'SHARE_VALIDATE_FAILED',
        `validate-plugin --local failed:\n${errors.join('\n')}`,
        {
            nextStep: 'Fix the plugin errors (jay-stack validate-plugin --local), then retry.',
        },
    );
}

/** Before the push nothing is shared yet: any failure moves the new `.git` to backup. */
async function commitAndPushNewBranch(
    ctx: ShareContext,
    target: { dir: string; folder: string; repo: string; branch: string },
): Promise<void> {
    const { dir, folder, repo, branch } = target;
    if (fs.existsSync(path.join(dir, '.git'))) {
        throw shareFailure(
            'SHARE_GIT_FAILED',
            `src/plugins/${folder} is already a git repository for another remote.`,
            {
                files: [`src/plugins/${folder}/.git`],
                nextStep:
                    'Move its .git folder away (or use share/link for an existing shared plugin), then retry.',
            },
        );
    }
    writePluginGitignore(dir);
    try {
        await ctx.git.run(['init', '--quiet', '-b', branch], dir);
        await ctx.git.run(['add', '-A'], dir);
        const staged = (await ctx.git.run(['diff', '--cached', '--name-only'], dir))
            .split('\n')
            .filter(Boolean);
        requireNoDeniedPaths(staged, 'Publish');
        await ctx.git.run(['commit', '--quiet', '-m', `Share ${folder}`], dir);
        await ctx.git.run(['remote', 'add', 'origin', repo], dir);
        await pushFirstCommit(ctx, dir, repo, branch);
    } catch (error) {
        moveToBackup(ctx.projectRoot, path.join(dir, '.git'), `${folder}-publish-git`);
        if (error instanceof ShareError) throw error;
        throw shareFailure('SHARE_GIT_FAILED', `Publish failed: ${String(error)}`);
    }
}

async function pushFirstCommit(
    ctx: ShareContext,
    dir: string,
    repo: string,
    branch: string,
): Promise<void> {
    try {
        await ctx.git.run(['push', '--quiet', '-u', 'origin', `HEAD:refs/heads/${branch}`], dir);
    } catch (error) {
        const failure = networkFailure(
            error,
            'publish-first-push',
            `Could not push ${branch} to ${repo}`,
        );
        if (failure.report.code === 'SHARE_BRANCH_NOT_EMPTY') throw branchNotEmpty(repo, branch);
        throw failure;
    }
}

/** After a successful push: entry + ignore block + untrack. A failure keeps `.git` so a retry resumes. */
async function recordPublished(
    ctx: ShareContext,
    entry: Omit<ShareEntry, 'commit'>,
    tracked: string[],
): Promise<ShareReport> {
    const dir = pluginFolderPath(ctx.projectRoot, entry.folder);
    const sha = await headSha(ctx.git, dir);
    try {
        upsertEntry(ctx.projectRoot, { ...entry, commit: sha });
        await ignoreSharedFolder(ctx, entry.folder, tracked);
    } catch (error) {
        throw shareFailure(
            'SHARE_GIT_FAILED',
            `Pushed, but could not record ${entry.folder} in share.yaml: ${String(error)}`,
            {
                files: [`src/plugins/${entry.folder}`],
                nextStep: `Fix the problem and rerun the same share/publish command — it resumes without pushing again.`,
            },
        );
    }
    return {
        ok: true,
        message: `Published src/plugins/${entry.folder} to ${entry.repo} (${entry.ref}) at ${sha.slice(0, 7)}.`,
        files: [],
        plugin: summarizePlugin({
            projectRoot: ctx.projectRoot,
            folder: entry.folder,
            repo: entry.repo,
            sha,
            setupRun: { setup: 'none' },
        }),
    };
}
