import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';

/** `.jay-share/` is share's only scratch folder; nothing is ever deleted (DL#237 TL;DR #16). */
export const SCRATCH_DIR = '.jay-share';

export function newTmpCloneDir(projectRoot: string): string {
    const dir = path.join(projectRoot, SCRATCH_DIR, `tmp-${randomBytes(6).toString('hex')}`);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    return dir;
}

/** UTC `YYYYMMDDTHHmmssZ`. */
export function backupTimestamp(now = new Date()): string {
    return now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d+Z$/, 'Z');
}

/**
 * Moves `source` to `.jay-share/backup/<label>-<timestamp>-<shortSha>/` and returns the new path.
 * A numeric suffix keeps two backups in the same second distinct.
 */
export function moveToBackup(
    projectRoot: string,
    source: string,
    label: string,
    shortSha = 'nosha',
): string {
    const backupRoot = path.join(projectRoot, SCRATCH_DIR, 'backup');
    fs.mkdirSync(backupRoot, { recursive: true });
    const base = path.join(backupRoot, `${label}-${backupTimestamp()}-${shortSha}`);
    let target = base;
    for (let n = 2; fs.existsSync(target); n++) target = `${base}-${n}`;
    fs.renameSync(source, target);
    return target;
}
