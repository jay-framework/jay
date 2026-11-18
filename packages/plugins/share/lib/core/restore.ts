import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShareContext } from './context';
import { pluginFolderPath, readManifest, type ShareEntry } from './manifest';
import { networkFailure, toReport } from './report';
import { moveToBackup, newTmpCloneDir } from './scratch';
import { hasRef } from './git-queries';
import { statusOf } from './status';
import { shareFailure, type ShareReport } from './types';

/**
 * `share/restore` (DL#237 § Flows): clone every entry missing on disk at its pinned commit, on
 * branch `<ref>` tracking `origin/<ref>` (not detached, so pull/push work). Never prompts.
 */
export async function restore(ctx: ShareContext): Promise<ShareReport> {
    const failures: { folder: string; report: ShareReport }[] = [];
    const entries = readManifest(ctx.projectRoot).plugins;
    for (const entry of entries) {
        if (fs.existsSync(pluginFolderPath(ctx.projectRoot, entry.folder))) continue;
        try {
            await restoreEntry(ctx, entry);
        } catch (error) {
            failures.push({ folder: entry.folder, report: toReport(error) });
        }
    }
    const plugins = await Promise.all(entries.map((e) => statusOf(ctx, e, false)));
    if (failures.length === 0) {
        return {
            ok: true,
            message: `All ${entries.length} shared plugin(s) are linked.`,
            files: [],
            plugins,
        };
    }
    const first = failures[0].report;
    return {
        ok: false,
        code: first.code,
        message: failures.map((f) => `${f.folder}: ${f.report.message}`).join('\n'),
        files: failures.map((f) => f.folder),
        nextStep: first.nextStep,
        plugins,
    };
}

async function restoreEntry(ctx: ShareContext, entry: ShareEntry): Promise<void> {
    const tmpDir = newTmpCloneDir(ctx.projectRoot);
    try {
        await ctx.git.run(
            [
                'clone',
                '--quiet',
                '--no-checkout',
                '--branch',
                entry.ref,
                '--single-branch',
                entry.repo,
                tmpDir,
            ],
            ctx.projectRoot,
        );
    } catch (error) {
        if (fs.existsSync(tmpDir))
            moveToBackup(ctx.projectRoot, tmpDir, `${entry.folder}-restore-failed`);
        throw networkFailure(error, 'clone', `Could not clone ${entry.repo} (${entry.ref})`);
    }
    try {
        if (!(await hasRef(ctx.git, tmpDir, entry.commit))) {
            throw shareFailure(
                'SHARE_COMMIT_MISSING',
                `Pinned commit ${entry.commit} is not in ${entry.repo} (${entry.ref}).`,
                {
                    nextStep: `Ask the plugin owner whether ${entry.ref} was rewritten; re-pin with share/unlink + share/link.`,
                },
            );
        }
        await ctx.git.run(['checkout', '--quiet', '-B', entry.ref, entry.commit], tmpDir);
        await ctx.git.run(
            ['branch', '--quiet', `--set-upstream-to=origin/${entry.ref}`, entry.ref],
            tmpDir,
        );
    } catch (error) {
        moveToBackup(
            ctx.projectRoot,
            tmpDir,
            `${entry.folder}-restore-failed`,
            entry.commit.slice(0, 7),
        );
        throw error;
    }
    const target = pluginFolderPath(ctx.projectRoot, entry.folder);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(tmpDir, target);
    await ctx.handlers.runSetupAndAgentKit(ctx.projectRoot, entry.folder);
}
