import type { ShareContext } from './context';
import { isSiteSubmodule, siteTrackedFiles } from './git-queries';
import { addIgnoredFolder } from './gitignore-block';
import { shareFailure } from './types';

const relFolder = (folder: string) => `src/plugins/${folder}`;

/**
 * Site-repo checks before a folder becomes shared: never a submodule, and already-tracked files
 * only with an explicit `untrack` (DL#237 Q12). Returns the tracked files to untrack later.
 */
export async function checkSiteRepoAllowsSharing(
    ctx: ShareContext,
    folder: string,
    untrack: boolean,
): Promise<string[]> {
    const rel = relFolder(folder);
    if (await isSiteSubmodule(ctx.git, ctx.projectRoot, rel)) {
        throw shareFailure(
            'SHARE_SUBMODULE',
            `${rel} is a git submodule of the site repo; share does not manage submodules.`,
            {
                files: [rel],
                nextStep: `Remove the submodule (git submodule deinit ${rel} && git rm ${rel}), then retry.`,
            },
        );
    }
    const tracked = await siteTrackedFiles(ctx.git, ctx.projectRoot, rel);
    if (tracked.length > 0 && !untrack) {
        throw shareFailure(
            'SHARE_TRACKED',
            `The site repo already tracks ${tracked.length} file(s) under ${rel}.`,
            {
                files: tracked,
                nextStep:
                    'Rerun with --untrack (untrack: true) to stop tracking them in the site repo (files stay on disk).',
            },
        );
    }
    return tracked;
}

/** Writes the ignore line and, when asked, untracks the folder from the site repo index. */
export async function ignoreSharedFolder(
    ctx: ShareContext,
    folder: string,
    tracked: string[],
): Promise<void> {
    addIgnoredFolder(ctx.projectRoot, folder);
    if (tracked.length > 0) {
        await ctx.git.run(
            ['rm', '-r', '--cached', '--quiet', '--', relFolder(folder)],
            ctx.projectRoot,
        );
    }
}
