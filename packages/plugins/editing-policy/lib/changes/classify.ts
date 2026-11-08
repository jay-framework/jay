import { Change, Tree } from './types.js';
import { classifyJayHtmlFile } from './classify-jay-html.js';

const ASSET_EXT = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
    'webp',
    'ico',
    'avif',
    'bmp',
    'woff',
    'woff2',
    'ttf',
    'otf',
    'eot',
    'mp4',
    'webm',
    'mov',
    'mp3',
    'wav',
    'pdf',
]);
const CODE_EXT = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'jay-contract']);
const LOCKFILES = new Set(['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml']);
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const POLICY_FILE = 'jay-policy.md';

function basename(p: string): string {
    return p.split('/').pop() ?? p;
}
function ext(p: string): string {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i >= 0 ? b.slice(i + 1).toLowerCase() : '';
}
function isAsset(p: string): boolean {
    return ASSET_EXT.has(ext(p));
}

/** Classify a modified file into one or more changes by file type (DL#231 §6.1). */
export function classifyModifiedFile(path: string, base: string, cand: string): Change[] {
    if (path === POLICY_FILE) {
        return [{ kind: 'policy', path, summary: `edited ${POLICY_FILE}` }];
    }
    if (path.endsWith('.jay-html')) {
        return classifyJayHtmlFile(path, base, cand);
    }
    if (path === 'package.json') {
        return classifyManifest(path, base, cand);
    }
    if (LOCKFILES.has(basename(path))) {
        return [{ kind: 'dependency', path, summary: `dependency lockfile ${path} changed` }];
    }
    const e = ext(path);
    if (CODE_EXT.has(e)) {
        return [{ kind: 'code', path, summary: `code changed in ${path}` }];
    }
    if (e === 'css') {
        return [{ kind: 'css', path, summary: `CSS changed in ${path}` }];
    }
    if (isAsset(path)) {
        return []; // assets are not governed (DL#231 §6.1)
    }
    return [{ kind: 'config', path, summary: `config changed in ${path}` }];
}

function classifyManifest(path: string, base: string, cand: string): Change[] {
    let b: Record<string, unknown>;
    let c: Record<string, unknown>;
    try {
        b = JSON.parse(base);
        c = JSON.parse(cand);
    } catch {
        return [{ kind: 'config', path, summary: `manifest ${path} changed` }];
    }
    const depChanged = DEP_FIELDS.some((f) => JSON.stringify(b[f]) !== JSON.stringify(c[f]));
    const keys = new Set([...Object.keys(b), ...Object.keys(c)]);
    const restChanged = [...keys].some(
        (k) => !DEP_FIELDS.includes(k) && JSON.stringify(b[k]) !== JSON.stringify(c[k]),
    );
    const changes: Change[] = [];
    if (depChanged)
        changes.push({ kind: 'dependency', path, summary: `dependencies changed in ${path}` });
    if (restChanged) changes.push({ kind: 'config', path, summary: `config changed in ${path}` });
    return changes;
}

function classifyAddedFile(path: string, _content: string): Change[] {
    if (isAsset(path)) return [];
    // A new file/page/section is a `create` (DL#231 §6.1). Judging markup inside a new page by
    // design/content (from-template) is resolved in the compare layer, not here.
    return [{ kind: 'create', path, summary: `added ${path}` }];
}

function lineSimilarity(a: string, b: string): number {
    const la = new Set(a.split('\n'));
    const lb = new Set(b.split('\n'));
    let inter = 0;
    for (const x of la) if (lb.has(x)) inter++;
    const union = new Set([...la, ...lb]).size;
    return union === 0 ? 1 : inter / union;
}

interface RenameResult {
    renames: Change[];
    consumedAdded: Set<string>;
    consumedRemoved: Set<string>;
}

function detectRenames(
    added: string[],
    removed: string[],
    baseline: Tree,
    candidate: Tree,
): RenameResult {
    const renames: Change[] = [];
    const consumedAdded = new Set<string>();
    const consumedRemoved = new Set<string>();

    for (const from of removed) {
        const fromContent = baseline.get(from)!;
        let to = added.find((a) => !consumedAdded.has(a) && candidate.get(a) === fromContent);
        if (!to) {
            let best: { a: string; score: number } | undefined;
            for (const a of added) {
                if (consumedAdded.has(a) || ext(a) !== ext(from)) continue;
                const score = lineSimilarity(fromContent, candidate.get(a)!);
                if (score >= 0.6 && (!best || score > best.score)) best = { a, score };
            }
            to = best?.a;
        }
        if (to) {
            consumedRemoved.add(from);
            consumedAdded.add(to);
            renames.push({
                kind: 'rename',
                path: to,
                fromPath: from,
                summary: `renamed ${from} → ${to}`,
            });
            const bc = baseline.get(from)!;
            const cc = candidate.get(to)!;
            if (bc !== cc) renames.push(...classifyModifiedFile(to, bc, cc));
        }
    }
    return { renames, consumedAdded, consumedRemoved };
}

/** Classify every change between two project trees (DL#231 §6.3 step 2). Pure. */
export function classifyChanges(baseline: Tree, candidate: Tree): Change[] {
    const baseSet = new Set(baseline.keys());
    const candSet = new Set(candidate.keys());

    let added = [...candidate.keys()].filter((p) => !baseSet.has(p)).sort();
    let removed = [...baseline.keys()].filter((p) => !candSet.has(p)).sort();
    const common = [...candidate.keys()].filter((p) => baseSet.has(p)).sort();

    const changes: Change[] = [];

    const { renames, consumedAdded, consumedRemoved } = detectRenames(
        added,
        removed,
        baseline,
        candidate,
    );
    changes.push(...renames);
    added = added.filter((p) => !consumedAdded.has(p));
    removed = removed.filter((p) => !consumedRemoved.has(p));

    for (const p of common) {
        const b = baseline.get(p)!;
        const c = candidate.get(p)!;
        if (b !== c) changes.push(...classifyModifiedFile(p, b, c));
    }
    for (const p of added) changes.push(...classifyAddedFile(p, candidate.get(p)!));
    for (const p of removed) {
        if (isAsset(p)) continue;
        changes.push({ kind: 'delete', path: p, summary: `deleted ${p}` });
    }

    return changes;
}
