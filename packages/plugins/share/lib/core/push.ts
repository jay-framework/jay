import type { ShareContext } from './context';
import { pluginFolderPath, selectEntries, upsertEntry, type ShareEntry } from './manifest';
import { aheadBehind, changedFiles, headSha, requireClean } from './git-queries';
import { fetchRef } from './status';
import { networkFailure } from './report';
import { requireNoDeniedPaths } from './denylist';
import { divergedFailure } from './pull';
import type { ShareReport } from './types';

export interface PushInput {
    folder?: string;
}

interface PushResult {
    localSha: string;
    remoteSha: string;
    outgoing: string[];
}

/**
 * `share/push` (DL#221 § Flows): refuse dirty, fetch, require fast-forward, denylist the outgoing
 * paths, `git push origin <ref>` (never `--force`), then re-pin `commit`.
 */
export async function push(ctx: ShareContext, input: PushInput = {}): Promise<ShareReport> {
    const entries = selectEntries(ctx.projectRoot, input.folder);
    const results: PushResult[] = [];
    for (const entry of entries) results.push(await pushEntry(ctx, entry));
    const single = results.length === 1 ? results[0] : undefined;
    const files = results.flatMap((r) => r.outgoing);
    return {
        ok: true,
        message: `Pushed ${files.length} changed file(s) from ${entries.length} shared plugin(s).`,
        files,
        ...(single && { localSha: single.localSha, remoteSha: single.remoteSha }),
    };
}

async function pushEntry(ctx: ShareContext, entry: ShareEntry): Promise<PushResult> {
    const dir = pluginFolderPath(ctx.projectRoot, entry.folder);
    const upstream = `origin/${entry.ref}`;
    await requireClean(ctx.git, dir, entry.folder);
    await fetchRef(ctx, dir, entry.ref);
    const localSha = await headSha(ctx.git, dir);
    const remoteSha = await ctx.git.run(['rev-parse', upstream], dir);
    const [, behind] = await aheadBehind(ctx.git, dir, upstream);
    if (behind > 0) throw divergedFailure(entry, localSha, remoteSha);

    const outgoing = await changedFiles(ctx.git, dir, `${upstream}..HEAD`);
    requireNoDeniedPaths(outgoing, 'Push');
    if (localSha !== remoteSha) {
        try {
            await ctx.git.run(['push', '--quiet', 'origin', `HEAD:refs/heads/${entry.ref}`], dir);
        } catch (error) {
            throw networkFailure(error, 'push', `Could not push to ${entry.repo} (${entry.ref})`);
        }
    }
    upsertEntry(ctx.projectRoot, { ...entry, commit: localSha });
    return { localSha, remoteSha: localSha, outgoing };
}
