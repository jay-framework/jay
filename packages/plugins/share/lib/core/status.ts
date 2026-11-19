import * as fs from 'node:fs';
import type { ShareContext } from './context';
import { pluginFolderPath, selectEntries, type ShareEntry } from './manifest';
import { networkFailure } from './report';
import { aheadBehind, dirtyFiles, hasRef, headSha } from './git-queries';
import { readPluginYaml } from './plugin-summary';
import type { PluginStatus, ShareReport } from './types';

export interface StatusInput {
    folder?: string;
    fetch?: boolean;
}

/** `share/status`: offline by default; `fetch: true` refreshes `origin/<ref>` first (TL;DR #20). */
export async function status(ctx: ShareContext, input: StatusInput = {}): Promise<ShareReport> {
    const entries = selectEntries(ctx.projectRoot, input.folder);
    const plugins = await Promise.all(entries.map((e) => statusOf(ctx, e, !!input.fetch)));
    return {
        ok: true,
        message: plugins.map(formatStatusLine).join('\n') || 'No shared plugins in share.yaml.',
        files: [],
        plugins,
    };
}

export async function statusOf(
    ctx: ShareContext,
    entry: ShareEntry,
    fetch: boolean,
): Promise<PluginStatus> {
    const dir = pluginFolderPath(ctx.projectRoot, entry.folder);
    const missing: PluginStatus = {
        folder: entry.folder,
        present: false,
        dirtyFiles: [],
        ahead: 0,
        behind: 0,
        diverged: false,
        pinnedSha: entry.commit,
        headMatchesPin: false,
        fetched: false,
    };
    if (!fs.existsSync(dir)) return missing;

    if (fetch) await fetchRef(ctx, dir, entry.ref);
    const head = await headSha(ctx.git, dir);
    const upstream = `origin/${entry.ref}`;
    const [ahead, behind] = (await hasRef(ctx.git, dir, upstream))
        ? await aheadBehind(ctx.git, dir, upstream)
        : [0, 0];
    return {
        ...missing,
        name: readPluginYaml(dir)?.name,
        present: true,
        dirtyFiles: await dirtyFiles(ctx.git, dir),
        ahead,
        behind,
        diverged: ahead > 0 && behind > 0,
        headSha: head,
        headMatchesPin: head === entry.commit,
        fetched: fetch,
    };
}

export async function fetchRef(ctx: ShareContext, dir: string, ref: string): Promise<void> {
    try {
        await ctx.git.run(
            ['fetch', '--quiet', 'origin', `+refs/heads/${ref}:refs/remotes/origin/${ref}`],
            dir,
        );
    } catch (error) {
        throw networkFailure(error, 'fetch', `Could not fetch origin/${ref}`);
    }
}

function formatStatusLine(s: PluginStatus): string {
    if (!s.present) return `${s.folder}  missing (run share/restore)`;
    const state = [
        s.dirtyFiles.length ? `dirty ${s.dirtyFiles.length}` : 'clean',
        s.ahead ? `ahead ${s.ahead}` : '',
        s.behind ? `behind ${s.behind}` : '',
        s.headMatchesPin ? '' : 'HEAD differs from share.yaml commit',
    ].filter(Boolean);
    return `${s.folder}  ${s.headSha?.slice(0, 7)}  ${state.join('  ')}`;
}
