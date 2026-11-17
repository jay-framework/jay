import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitRunner } from '../core/git-runner';
import { PLUGINS_DIR, pluginFolderPath, readManifest, type ShareEntry } from '../core/manifest';
import { folderIgnoreLine, readIgnoredFolderLines } from '../core/gitignore-block';
import { dirtyFiles, headSha, siteTrackedFiles } from '../core/git-queries';

export type ShareCheckCode =
    | 'SHARE-MANIFEST-MISSING-FOLDER'
    | 'SHARE-FOLDER-NOT-IN-MANIFEST'
    | 'SHARE-NOT-IGNORED'
    | 'SHARE-COMMIT-MISMATCH'
    | 'SHARE-DIRTY';

/** Every share finding is a warning: it never fails `jay-stack validate` (DL#237 Phase 1a). */
export interface ShareFinding {
    code: ShareCheckCode;
    severity: 'warning';
    message: string;
    suggestion: string;
}

/** The five manifest/hygiene checks over `share.yaml`, `src/plugins/*` and the managed ignore block. */
export async function checkShareHygiene(
    projectRoot: string,
    git: GitRunner,
): Promise<ShareFinding[]> {
    const { plugins } = readManifest(projectRoot);
    const findings = unlistedRepoFolders(projectRoot, plugins);
    for (const entry of plugins) findings.push(...(await checkEntry(projectRoot, git, entry)));
    return findings;
}

async function checkEntry(
    projectRoot: string,
    git: GitRunner,
    entry: ShareEntry,
): Promise<ShareFinding[]> {
    const dir = pluginFolderPath(projectRoot, entry.folder);
    const rel = `src/plugins/${entry.folder}`;
    if (!fs.existsSync(dir)) {
        return [
            warning(
                'SHARE-MANIFEST-MISSING-FOLDER',
                `share.yaml lists ${entry.folder} but ${rel} is missing.`,
                'Run `jay-stack run share/restore`.',
            ),
        ];
    }
    const findings: ShareFinding[] = [];
    const ignored = readIgnoredFolderLines(projectRoot).includes(folderIgnoreLine(entry.folder));
    const tracked = await siteTrackedFiles(git, projectRoot, rel);
    if (!ignored || tracked.length > 0) {
        findings.push(
            warning(
                'SHARE-NOT-IGNORED',
                ignored
                    ? `The site repo still tracks ${tracked.length} file(s) under ${rel}.`
                    : `${rel} is not in the "# >>> jay share" block of .gitignore.`,
                `Run \`git rm -r --cached ${rel}\` and keep the line ${folderIgnoreLine(entry.folder)} in the managed .gitignore block (share/link and share/publish write it).`,
            ),
        );
    }
    if (!fs.existsSync(path.join(dir, '.git'))) return findings;
    const head = await headSha(git, dir);
    if (head !== entry.commit) {
        findings.push(
            warning(
                'SHARE-COMMIT-MISMATCH',
                `${rel} HEAD ${head.slice(0, 7)} differs from the share.yaml commit ${entry.commit.slice(0, 7)}.`,
                'Run `jay-stack run share/push` to publish and re-pin local commits, or check out the pinned commit.',
            ),
        );
    }
    const dirty = await dirtyFiles(git, dir);
    if (dirty.length > 0) {
        findings.push(
            warning(
                'SHARE-DIRTY',
                `${rel} has ${dirty.length} uncommitted change(s).`,
                `Commit inside ${rel}, then \`jay-stack run share/push --folder ${entry.folder}\`.`,
            ),
        );
    }
    return findings;
}

/** A folder with its own `.git` under src/plugins that share.yaml does not list. */
function unlistedRepoFolders(projectRoot: string, plugins: ShareEntry[]): ShareFinding[] {
    const pluginsDir = path.join(projectRoot, PLUGINS_DIR);
    if (!fs.existsSync(pluginsDir)) return [];
    const listed = new Set(plugins.map((e) => e.folder));
    return fs
        .readdirSync(pluginsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !listed.has(d.name))
        .filter((d) => fs.existsSync(path.join(pluginsDir, d.name, '.git')))
        .map((d) =>
            warning(
                'SHARE-FOLDER-NOT-IN-MANIFEST',
                `src/plugins/${d.name} is a git clone that share.yaml does not list.`,
                'Remove the clone and use `jay-stack run share/link --repo <url>`, or publish it with share/publish.',
            ),
        );
}

function warning(code: ShareCheckCode, message: string, suggestion: string): ShareFinding {
    return { code, severity: 'warning', message: `[${code}] ${message}`, suggestion };
}
