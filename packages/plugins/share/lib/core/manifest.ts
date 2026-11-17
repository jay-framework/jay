import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { shareFailure } from './types';

/** One `share.yaml` entry: `commit` is the lock, `ref` is what pull tracks (DL#221 TL;DR #4). */
export interface ShareEntry {
    folder: string;
    repo: string;
    ref: string;
    commit: string;
}

export interface ShareManifest {
    plugins: ShareEntry[];
}

export const MANIFEST_FILE = 'share.yaml';
export const PLUGINS_DIR = path.join('src', 'plugins');
export const DEFAULT_REF = 'main';

export function manifestPath(projectRoot: string): string {
    return path.join(projectRoot, MANIFEST_FILE);
}

export function pluginFolderPath(projectRoot: string, folder: string): string {
    return path.join(projectRoot, PLUGINS_DIR, folder);
}

/** Missing file = empty manifest. Malformed entries are skipped (validators report folder issues). */
export function readManifest(projectRoot: string): ShareManifest {
    const file = manifestPath(projectRoot);
    if (!fs.existsSync(file)) return { plugins: [] };
    const parsed = YAML.parse(fs.readFileSync(file, 'utf-8')) ?? {};
    const entries: unknown[] = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    return {
        plugins: entries.filter(isEntry).map((e) => ({
            folder: e.folder,
            repo: e.repo,
            ref: e.ref || DEFAULT_REF,
            commit: String(e.commit ?? ''),
        })),
    };
}

function isEntry(value: unknown): value is ShareEntry {
    const e = value as ShareEntry;
    return !!e && typeof e.folder === 'string' && typeof e.repo === 'string';
}

export function writeManifest(projectRoot: string, manifest: ShareManifest): void {
    fs.writeFileSync(manifestPath(projectRoot), YAML.stringify(manifest), 'utf-8');
}

export function upsertEntry(projectRoot: string, entry: ShareEntry): void {
    const manifest = readManifest(projectRoot);
    const others = manifest.plugins.filter((e) => e.folder !== entry.folder);
    writeManifest(projectRoot, { plugins: [...others, entry] });
}

export function removeEntry(projectRoot: string, folder: string): void {
    const manifest = readManifest(projectRoot);
    writeManifest(projectRoot, { plugins: manifest.plugins.filter((e) => e.folder !== folder) });
}

/** The entries an operation acts on: all, or exactly the named folder (SHARE_NOT_IN_MANIFEST). */
export function selectEntries(projectRoot: string, folder?: string): ShareEntry[] {
    const { plugins } = readManifest(projectRoot);
    if (!folder) return plugins;
    const entry = plugins.find((e) => e.folder === folder);
    if (!entry) {
        throw shareFailure('SHARE_NOT_IN_MANIFEST', `"${folder}" is not listed in share.yaml.`, {
            files: [folder],
            nextStep: 'Run share/status to see shared folders, or share/link to add one.',
        });
    }
    return [entry];
}
