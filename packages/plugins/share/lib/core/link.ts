import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanPlugins } from '@jay-framework/stack-server-runtime';
import type { ShareContext } from './context';
import {
    DEFAULT_REF,
    pluginFolderPath,
    readManifest,
    upsertEntry,
    writeManifest,
    type ShareEntry,
    type ShareManifest,
} from './manifest';
import { requireGithubRepoUrl } from './repo-url';
import { networkFailure } from './report';
import { moveToBackup, newTmpCloneDir } from './scratch';
import { checkSiteRepoAllowsSharing, ignoreSharedFolder } from './site-guards';
import { readPluginYaml, summarizePlugin } from './plugin-summary';
import { headSha } from './git-queries';
import { shareFailure, ShareError, type ShareReport } from './types';

export interface LinkInput {
    repo: string;
    ref?: string;
    as?: string;
    untrack?: boolean;
}

/** `share/link` (DL#221 § Flows): clone a shared plugin branch into `src/plugins/<folder>` and pin it. */
export async function link(ctx: ShareContext, input: LinkInput): Promise<ShareReport> {
    const repo = requireGithubRepoUrl(input.repo);
    const ref = input.ref || DEFAULT_REF;
    requireRepoNotInManifest(ctx.projectRoot, repo);

    const tmpDir = await cloneSingleBranch(ctx, repo, ref);
    let folder: string;
    let tracked: string[];
    try {
        folder = await checkClone(ctx, tmpDir, ref, input);
        tracked = await checkSiteRepoAllowsSharing(ctx, folder, !!input.untrack);
    } catch (error) {
        moveToBackup(ctx.projectRoot, tmpDir, 'link-failed');
        throw error;
    }

    const sha = await headSha(ctx.git, tmpDir);
    const target = pluginFolderPath(ctx.projectRoot, folder);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(tmpDir, target);
    await recordLinkedFolder(ctx, { folder, repo, ref, commit: sha }, tracked);

    const setupRun = await ctx.handlers.runSetupAndAgentKit(ctx.projectRoot, folder);
    return {
        ok: true,
        message: `Linked ${repo} (${ref}) into src/plugins/${folder} at ${sha.slice(0, 7)}.`,
        files: [],
        plugin: summarizePlugin({ projectRoot: ctx.projectRoot, folder, repo, sha, setupRun }),
    };
}

function requireRepoNotInManifest(projectRoot: string, repo: string): void {
    const existing = readManifest(projectRoot).plugins.find((e) => e.repo === repo);
    if (!existing) return;
    const missing = !fs.existsSync(pluginFolderPath(projectRoot, existing.folder));
    throw shareFailure(
        'SHARE_ALREADY_IN_MANIFEST',
        `${repo} is already shared as "${existing.folder}".`,
        {
            files: [existing.folder],
            nextStep: missing
                ? 'jay-stack run share/restore'
                : `jay-stack run share/pull --folder ${existing.folder}`,
        },
    );
}

/** Single-branch clone into `.jay-share/tmp-*`; the fetch refspec stays limited to `<ref>`. */
async function cloneSingleBranch(ctx: ShareContext, repo: string, ref: string): Promise<string> {
    const tmpDir = newTmpCloneDir(ctx.projectRoot);
    try {
        await ctx.git.run(
            ['clone', '--quiet', '--branch', ref, '--single-branch', repo, tmpDir],
            ctx.projectRoot,
        );
    } catch (error) {
        if (fs.existsSync(tmpDir)) moveToBackup(ctx.projectRoot, tmpDir, 'link-failed');
        throw networkFailure(error, 'clone', `Could not clone ${repo} (${ref})`);
    }
    return tmpDir;
}

/** Returns the target folder after the clone-level checks. */
async function checkClone(
    ctx: ShareContext,
    tmpDir: string,
    ref: string,
    input: LinkInput,
): Promise<string> {
    const manifest = readPluginYaml(tmpDir);
    if (!manifest) {
        throw shareFailure(
            'SHARE_NOT_A_PLUGIN',
            `Branch "${ref}" of ${input.repo} has no plugin.yaml at its root.`,
            {
                nextStep: `Pick the branch that holds the plugin: share/link --repo ${input.repo} --ref <branch>`,
            },
        );
    }
    const folder = input.as || manifest.name;
    if (!folder || !/^[A-Za-z0-9._-]+$/.test(folder)) {
        throw shareFailure(
            'SHARE_FOLDER_EXISTS',
            `Cannot use "${folder ?? ''}" as a folder name under src/plugins.`,
            {
                nextStep: `Choose a folder: share/link --repo ${input.repo} --as <folder>`,
            },
        );
    }
    if (fs.existsSync(pluginFolderPath(ctx.projectRoot, folder))) {
        throw shareFailure('SHARE_FOLDER_EXISTS', `src/plugins/${folder} already exists.`, {
            files: [`src/plugins/${folder}`],
            nextStep: `share/link --repo ${input.repo} --as <other-folder>`,
        });
    }
    await requireNoNameClash(ctx.projectRoot, manifest.name);
    return folder;
}

/** Commands and actions are keyed by plugin name, so two copies of one plugin cannot coexist (Q4). */
async function requireNoNameClash(projectRoot: string, name: string | undefined): Promise<void> {
    if (!name) return;
    const plugins = await scanPlugins({ projectRoot, includeDevDeps: true });
    const clash = [...plugins.values()].find((p) => p.name === name);
    if (!clash) return;
    throw shareFailure(
        'SHARE_NAME_CLASH',
        `A plugin named "${name}" is already installed (${clash.pluginPath}).`,
        {
            files: [clash.pluginPath],
            nextStep: '--as only renames the folder; unlink or uninstall the other copy first.',
        },
    );
}

/** A folder never sits in src/plugins without a share.yaml entry and an ignore line. */
async function recordLinkedFolder(
    ctx: ShareContext,
    entry: ShareEntry,
    tracked: string[],
): Promise<void> {
    const previousManifest = readManifest(ctx.projectRoot);
    try {
        upsertEntry(ctx.projectRoot, entry);
        await ignoreSharedFolder(ctx, entry.folder, tracked);
    } catch (error) {
        restoreManifestQuietly(ctx.projectRoot, previousManifest);
        const target = pluginFolderPath(ctx.projectRoot, entry.folder);
        const backup = moveToBackup(
            ctx.projectRoot,
            target,
            entry.folder,
            entry.commit.slice(0, 7),
        );
        if (error instanceof ShareError) throw error;
        throw shareFailure(
            'SHARE_GIT_FAILED',
            `Could not record ${entry.folder} in share.yaml: ${String(error)}`,
            {
                files: [backup],
            },
        );
    }
}

function restoreManifestQuietly(projectRoot: string, manifest: ShareManifest): void {
    try {
        writeManifest(projectRoot, manifest);
    } catch {
        // The manifest itself is unwritable — nothing was recorded, so nothing to undo.
    }
}
