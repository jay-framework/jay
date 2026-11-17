import path from 'path';
import { parseJayFile, JAY_IMPORT_RESOLVER } from '@jay-framework/compiler-jay-html';
import { isRegionTag } from '@jay-framework/compiler-inline-composition';
import type { HTMLElement } from 'node-html-parser';

// DL#233: read jay-html with the COMPILER parser (parseJayFile), never raw node-html-parser — only it
// understands <jay:X> region tags, `template=` provenance, and headless imports. Returns the parsed
// `body` (a node-html-parser HTMLElement) and the region `template=` provenance.

export interface ParsedPage {
    body: HTMLElement;
    /** Region tag name → source-template path (`template=` provenance, DL#196). */
    provenance: Map<string, string>;
}

/**
 * Parse one jay-html file with the compiler. `root` is the on-disk project root the file lives under
 * (needed for the compiler's import resolution). Returns null if parsing yields no usable tree.
 */
export async function parsePage(
    content: string,
    relPath: string,
    root: string,
): Promise<ParsedPage | null> {
    const filename = path.basename(relPath);
    const dirname = path.dirname(path.resolve(root, relPath));
    let result;
    try {
        result = await parseJayFile(content, filename, dirname, {}, JAY_IMPORT_RESOLVER, root);
    } catch {
        return null;
    }
    const val = result.val;
    if (!val || !val.body) return null;

    // `template=` is written relative to the page's directory; resolve to a root-relative POSIX path
    // so it can be matched against the policy's project-root `templates` globs.
    const pageDirAbs = path.dirname(path.resolve(root, relPath));
    const provenance = new Map<string, string>();
    for (const imp of val.headlessImports ?? []) {
        if (imp.template) {
            const abs = path.resolve(pageDirAbs, imp.template);
            provenance.set(imp.contractName, path.relative(root, abs).split(path.sep).join('/'));
        }
    }
    return { body: val.body as HTMLElement, provenance };
}

const POLICY_ATTR = 'jay-policy';

/** The first element carrying `jay-policy="<name>"` in a parsed body. */
export function findMarkedSubtree(body: HTMLElement, name: string): HTMLElement | undefined {
    for (const el of body.querySelectorAll('*')) {
        if (el.getAttribute(POLICY_ATTR) === name) return el as unknown as HTMLElement;
    }
    return undefined;
}

export interface ElementSig {
    isRegion: boolean;
    tag: string;
    classes: string[];
    styles: Array<[string, string]>;
    /** Signature key for multiset matching (tag + classes + inline styles; text and jay-policy excluded). */
    key: string;
}

function elementSig(el: HTMLElement): ElementSig {
    const tag = el.rawTagName?.toLowerCase() ?? '';
    const region = isRegionTag(el);
    const classAttr = el.getAttribute('class') ?? '';
    const classes = classAttr.split(/\s+/).filter(Boolean).sort();
    const styleAttr = el.getAttribute('style') ?? '';
    const styles: Array<[string, string]> = styleAttr
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
            const i = d.indexOf(':');
            return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()] as [string, string];
        })
        .sort((a, b) => a[0].localeCompare(b[0]));
    const key = `${region ? 'region:' : ''}${tag}|${classes.join('.')}|${styles.map(([p, v]) => `${p}:${v}`).join(';')}`;
    return { isRegion: region, tag, classes, styles, key };
}

function collectElements(root: HTMLElement): HTMLElement[] {
    return root.querySelectorAll('*') as unknown as HTMLElement[];
}

export interface DesignDiff {
    /** Added elements (present in candidate, no matching baseline element by signature). */
    added: ElementSig[];
    /** Count of baseline elements with no matching candidate signature — a changed/removed existing element. */
    removedOrChanged: number;
}

/**
 * Multiset design diff over two parsed bodies (DL#233). Position-independent: an element is "added"
 * when the candidate has more of its signature than the baseline, "removed/changed" when fewer. A
 * re-theme (class edited) shows as one removed (old sig) + one added (new sig). Avoids NodePath
 * alignment (DL#231 noted that as fragile).
 */
export function designDiff(baseBody: HTMLElement, candBody: HTMLElement): DesignDiff {
    const baseCounts = new Map<string, number>();
    for (const el of collectElements(baseBody)) {
        const k = elementSig(el).key;
        baseCounts.set(k, (baseCounts.get(k) ?? 0) + 1);
    }

    const added: ElementSig[] = [];
    for (const el of collectElements(candBody)) {
        const sig = elementSig(el);
        const n = baseCounts.get(sig.key) ?? 0;
        if (n > 0) baseCounts.set(sig.key, n - 1);
        else added.push(sig);
    }

    let removedOrChanged = 0;
    for (const n of baseCounts.values()) removedOrChanged += n;

    return { added, removedOrChanged };
}
