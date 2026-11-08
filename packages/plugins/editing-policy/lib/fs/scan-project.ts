import fs from 'fs';
import path from 'path';
import { parse as parseHtml } from 'node-html-parser';

/** Directories never walked (build output, deps, VCS). */
export const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.yarn', '.cache']);

/** List project files as root-relative POSIX paths, skipping {@link IGNORED_DIRS} and hidden dirs. */
export function walkFiles(root: string, ignore: Set<string> = IGNORED_DIRS): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (ignore.has(entry.name) || entry.name.startsWith('.')) continue;
                walk(full);
            } else if (entry.isFile()) {
                out.push(path.relative(root, full).split(path.sep).join('/'));
            }
        }
    };
    walk(root);
    return out.sort();
}

/**
 * Scan the project's `.jay-html` files for `jay-policy="<name>"` markers, returning a set of
 * `"<root-relative-path>#<name>"`. Reads template source (not rendered output).
 */
export function collectPolicyMarkers(root: string, files: string[]): Set<string> {
    const markers = new Set<string>();
    for (const rel of files) {
        if (!rel.endsWith('.jay-html')) continue;
        let content: string;
        try {
            content = fs.readFileSync(path.join(root, rel), 'utf-8');
        } catch {
            continue;
        }
        for (const name of policyMarkerNames(content)) {
            markers.add(`${rel}#${name}`);
        }
    }
    return markers;
}

/** The `jay-policy` marker names present in one jay-html source string. */
export function policyMarkerNames(jayHtml: string): string[] {
    const names: string[] = [];
    const doc = parseHtml(jayHtml);
    for (const el of doc.querySelectorAll('*')) {
        const name = el.getAttribute('jay-policy');
        if (name) names.push(name);
    }
    return names;
}
