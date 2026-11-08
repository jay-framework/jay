import { parse as parseHtml, HTMLElement, NodeType } from 'node-html-parser';
import { Change } from './types.js';

// Baseline-vs-candidate `.jay-html` classification. We do NOT use compiler-inline-composition's
// `diffBodies` here: that applies template-vs-region suppression (`override`/`jay-content`), which
// would hide exactly the content edits we must detect. Instead we compare three independent
// signatures — text (content), structure+attrs (design), and <style> blocks (css) — per the DL#231
// §6.1 file-type rules (inline styles/classes = design; <style> = css; text = content).

const POLICY_ATTR = 'jay-policy';

/** The `jay-policy` markers in a parsed doc, first element per name. */
function markerMap(root: HTMLElement): Map<string, HTMLElement> {
    const map = new Map<string, HTMLElement>();
    for (const el of root.querySelectorAll('*')) {
        const name = el.getAttribute(POLICY_ATTR);
        if (name && !map.has(name)) map.set(name, el);
    }
    return map;
}

/** Concatenated, whitespace-collapsed text nodes, excluding text inside <style>. */
function textSignature(el: HTMLElement): string {
    const parts: string[] = [];
    const walk = (node: HTMLElement) => {
        for (const child of node.childNodes) {
            if (child.nodeType === NodeType.TEXT_NODE) {
                const t = child.rawText.replace(/\s+/g, ' ').trim();
                if (t) parts.push(t);
            } else if (child.nodeType === NodeType.ELEMENT_NODE) {
                const elc = child as HTMLElement;
                if (elc.rawTagName?.toLowerCase() === 'style') continue;
                walk(elc);
            }
        }
    };
    walk(el);
    return parts.join('\u0001');
}

/** Tag tree + attributes (class/style included, jay-policy excluded); text and <style> omitted. */
function structureSignature(el: HTMLElement): string {
    const parts: string[] = [];
    const walk = (node: HTMLElement, depth: number) => {
        for (const child of node.childNodes) {
            if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
            const elc = child as HTMLElement;
            const tag = elc.rawTagName?.toLowerCase() ?? '';
            if (tag === 'style') continue;
            const attrs = Object.entries(elc.attributes)
                .filter(([k]) => k.toLowerCase() !== POLICY_ATTR)
                .map(([k, v]) => `${k.toLowerCase()}=${v}`)
                .sort();
            parts.push(`${depth}:${tag}[${attrs.join(',')}]`);
            walk(elc, depth + 1);
        }
    };
    walk(el, 0);
    return parts.join('\u0001');
}

/** Concatenated <style> block contents (CSS). */
function cssSignature(el: HTMLElement): string {
    return el
        .querySelectorAll('style')
        .map((s) => s.rawText.replace(/\s+/g, ' ').trim())
        .join('\u0001');
}

interface JayHtmlKinds {
    content: boolean;
    design: boolean;
    css: boolean;
}

function classifyBody(base: HTMLElement, cand: HTMLElement): JayHtmlKinds {
    return {
        content: textSignature(base) !== textSignature(cand),
        design: structureSignature(base) !== structureSignature(cand),
        css: cssSignature(base) !== cssSignature(cand),
    };
}

function emitKinds(
    changes: Change[],
    path: string,
    section: string | undefined,
    kinds: JayHtmlKinds,
) {
    const where = section ? `${path}#${section}` : path;
    if (kinds.content)
        changes.push({ kind: 'content', path, section, summary: `content changed in ${where}` });
    if (kinds.design)
        changes.push({ kind: 'design', path, section, summary: `design changed in ${where}` });
    if (kinds.css) changes.push({ kind: 'css', path, section, summary: `CSS changed in ${where}` });
}

/**
 * Empty the subtrees of the given (stable) markers so the "rest of file" comparison excludes
 * section-owned content. Only markers present in both versions are neutralised — an added/removed
 * marker is a policy change whose (unchanged) content stays in the rest and compares equal there.
 */
function neutralizeMarked(root: HTMLElement, stableNames: Set<string>): HTMLElement {
    for (const el of root.querySelectorAll('*')) {
        const name = el.getAttribute(POLICY_ATTR);
        if (name && stableNames.has(name)) el.set_content('');
    }
    return root;
}

/** Classify the difference between two versions of one `.jay-html` file. */
export function classifyJayHtmlFile(
    path: string,
    baseContent: string,
    candContent: string,
): Change[] {
    const changes: Change[] = [];
    const baseMarkers = markerMap(parseHtml(baseContent));
    const candMarkers = markerMap(parseHtml(candContent));

    // policy: a `jay-policy` marker added or removed (a changed value is a remove + add, since the
    // value is the name).
    const names = new Set([...baseMarkers.keys(), ...candMarkers.keys()]);
    for (const name of [...names].sort()) {
        const inBase = baseMarkers.has(name);
        const inCand = candMarkers.has(name);
        if (inBase && !inCand) {
            changes.push({
                kind: 'policy',
                path,
                section: name,
                summary: `jay-policy="${name}" marker removed in ${path}`,
            });
        } else if (!inBase && inCand) {
            changes.push({
                kind: 'policy',
                path,
                section: name,
                summary: `jay-policy="${name}" marker added in ${path}`,
            });
        }
    }

    // section-scoped content/design/css for markers present in both versions ("stable" markers)
    const stableNames = new Set([...names].filter((n) => baseMarkers.has(n) && candMarkers.has(n)));
    for (const name of [...stableNames].sort()) {
        emitKinds(
            changes,
            path,
            name,
            classifyBody(baseMarkers.get(name)!, candMarkers.get(name)!),
        );
    }

    // the rest of the file (stable marked subtrees neutralised)
    const restBase = neutralizeMarked(parseHtml(baseContent), stableNames);
    const restCand = neutralizeMarked(parseHtml(candContent), stableNames);
    emitKinds(changes, path, undefined, classifyBody(restBase, restCand));

    return changes;
}
