import fs from 'fs';
import path from 'path';
import { walkFiles } from './scan-project.js';
import { Tree } from '../changes/types.js';

/** Read a project directory into a {@link Tree} (root-relative POSIX path → contents). */
export function readTree(dir: string): Tree {
    const tree: Tree = new Map();
    for (const rel of walkFiles(dir)) {
        try {
            tree.set(rel, fs.readFileSync(path.join(dir, rel), 'utf-8'));
        } catch {
            // unreadable file (e.g. a socket) — skip
        }
    }
    return tree;
}
