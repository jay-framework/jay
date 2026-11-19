import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ShareContext } from './context';
import { pluginFolderPath, removeEntry, selectEntries } from './manifest';
import { removeIgnoredFolder } from './gitignore-block';
import { moveToBackup } from './scratch';
import { headSha } from './git-queries';
import type { ShareReport } from './types';

export interface UnlinkInput {
    folder: string;
}

/** `share/unlink`: drop the entry and ignore line; the folder moves to backup, never deleted. */
export async function unlink(ctx: ShareContext, input: UnlinkInput): Promise<ShareReport> {
    const [entry] = selectEntries(ctx.projectRoot, input.folder);
    const dir = pluginFolderPath(ctx.projectRoot, entry.folder);
    const files: string[] = [];
    if (fs.existsSync(dir)) {
        const sha = await headSha(ctx.git, dir).catch(() => entry.commit);
        files.push(
            path.relative(
                ctx.projectRoot,
                moveToBackup(ctx.projectRoot, dir, entry.folder, sha.slice(0, 7)),
            ),
        );
    }
    removeEntry(ctx.projectRoot, entry.folder);
    removeIgnoredFolder(ctx.projectRoot, entry.folder);
    return {
        ok: true,
        message: `Unlinked ${entry.folder}${files.length ? `; folder moved to ${files[0]}` : ''}.`,
        files,
    };
}
