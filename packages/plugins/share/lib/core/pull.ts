import type { ShareContext } from './context';
import { pluginFolderPath, selectEntries, upsertEntry, type ShareEntry } from './manifest';
import { changedFiles, headSha, requireClean, splitIncoming } from './git-queries';
import { fetchRef } from './status';
import { summarizePlugin } from './plugin-summary';
import { shareFailure, type IncomingFiles, type PluginSummary, type ShareReport } from './types';

export interface PullInput {
    folder?: string;
    dryRun?: boolean;
}

interface PullResult {
    localSha: string;
    remoteSha: string;
    incoming: IncomingFiles;
    plugin?: PluginSummary;
}

/**
 * `share/pull` (DL#221 § Flows): `git merge --ff-only origin/<ref>`; jay never merges or rebases.
 * `dryRun` fetches and lists `HEAD..origin/<ref>` without changing anything.
 */
export async function pull(ctx: ShareContext, input: PullInput = {}): Promise<ShareReport> {
    const entries = selectEntries(ctx.projectRoot, input.folder);
    const results: PullResult[] = [];
    for (const entry of entries) results.push(await pullEntry(ctx, entry, !!input.dryRun));

    const single = results.length === 1 ? results[0] : undefined;
    const incoming = mergeIncoming(results.map((r) => r.incoming));
    const verb = input.dryRun ? 'would bring' : 'brought';
    return {
        ok: true,
        message: `Pull ${verb} ${incoming.codeFiles.length + incoming.otherFiles.length} changed file(s) into ${entries.length} shared plugin(s).`,
        files: [],
        incoming,
        ...(single && { localSha: single.localSha, remoteSha: single.remoteSha }),
        ...(single?.plugin && { plugin: single.plugin }),
    };
}

async function pullEntry(
    ctx: ShareContext,
    entry: ShareEntry,
    dryRun: boolean,
): Promise<PullResult> {
    const dir = pluginFolderPath(ctx.projectRoot, entry.folder);
    await requireClean(ctx.git, dir, entry.folder);
    await fetchRef(ctx, dir, entry.ref);
    const localSha = await headSha(ctx.git, dir);
    const remoteSha = await ctx.git.run(['rev-parse', `origin/${entry.ref}`], dir);
    const incoming = splitIncoming(await changedFiles(ctx.git, dir, `${localSha}..${remoteSha}`));
    if (dryRun) return { localSha, remoteSha, incoming };

    try {
        await ctx.git.run(['merge', '--ff-only', '--quiet', `origin/${entry.ref}`], dir);
    } catch {
        throw divergedFailure(entry, localSha, remoteSha);
    }
    const newSha = await headSha(ctx.git, dir);
    upsertEntry(ctx.projectRoot, { ...entry, commit: newSha });
    if (newSha === localSha) return { localSha, remoteSha, incoming };

    const setupRun = await ctx.handlers.runSetupAndAgentKit(ctx.projectRoot, entry.folder);
    const plugin = summarizePlugin({
        projectRoot: ctx.projectRoot,
        folder: entry.folder,
        repo: entry.repo,
        sha: newSha,
        setupRun,
    });
    return { localSha, remoteSha, incoming, plugin };
}

export function divergedFailure(entry: ShareEntry, localSha: string, remoteSha: string) {
    return shareFailure(
        'SHARE_DIVERGED',
        `src/plugins/${entry.folder} and origin/${entry.ref} have both moved (local ${localSha.slice(0, 7)}, remote ${remoteSha.slice(0, 7)}).`,
        {
            localSha,
            remoteSha,
            nextStep: `cd src/plugins/${entry.folder} && git pull --rebase origin ${entry.ref}, then jay-stack run share/push --folder ${entry.folder}`,
        },
    );
}

function mergeIncoming(all: IncomingFiles[]): IncomingFiles {
    return {
        codeFiles: all.flatMap((i) => i.codeFiles),
        otherFiles: all.flatMap((i) => i.otherFiles),
    };
}
