import fs from 'fs';
import path from 'path';
import { walkFiles } from './scan-project.js';
import { Tree } from '../changes/types.js';

/**
 * A {@link Tree} backed by a directory. File paths are listed up front (cheap); contents are read
 * from disk on demand and not cached, so a comparison never holds the whole project in memory.
 */
export function treeFromDir(dir: string): Tree {
    const files = walkFiles(dir);
    const set = new Set(files);
    return {
        paths: () => files,
        has: (rel) => set.has(rel),
        read: (rel) => {
            if (!set.has(rel)) throw new Error(`no such file in tree: ${rel}`);
            return fs.readFileSync(path.join(dir, rel), 'utf-8');
        },
    };
}
