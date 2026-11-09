import { matchGlob } from '../glob.js';

// One selector kind (DL#231 §6.1): a glob over project-root-relative file paths, optionally
// followed by `#<name>` to target a policy-marked section. Routes are folders under `src/pages`,
// so a route is addressed by its folder; no separate route syntax.

export interface ParsedSelector {
    /** The original selector string, as written in the policy. */
    raw: string;
    /** File-path glob, project-root-relative. */
    pathGlob: string;
    /** Optional `#<name>` section target (a `jay-policy="<name>"` marker). */
    section?: string;
}

export class SelectorParseError extends Error {}

/**
 * Parse a selector. A `#<name>` suffix targets a section. Shorthand: when the path part of a
 * sectioned selector is a folder (no `.jay-html`), it expands to that folder's `page.jay-html`.
 */
export function parseSelector(raw: string): ParsedSelector {
    if (typeof raw !== 'string' || raw.trim() === '') {
        throw new SelectorParseError('selector must be a non-empty string');
    }
    const trimmed = raw.trim();
    const hashCount = (trimmed.match(/#/g) ?? []).length;
    if (hashCount > 1) {
        throw new SelectorParseError(`selector "${raw}" has more than one '#'`);
    }

    if (hashCount === 0) {
        return { raw, pathGlob: trimmed };
    }

    const [pathPart, section] = trimmed.split('#');
    if (pathPart === '') {
        throw new SelectorParseError(`selector "${raw}" has an empty path before '#'`);
    }
    if (section === '') {
        throw new SelectorParseError(`selector "${raw}" has an empty section after '#'`);
    }

    // Folder shorthand: `<folder>#<name>` → `<folder>/page.jay-html#<name>`, but only when the path
    // part is folder-like. A path with a file extension that is not `.jay-html` is kept as-is so the
    // validator can flag `#name` on a non-.jay-html file.
    const lastSegment = pathPart.replace(/\/$/, '').split('/').pop() ?? '';
    const isFolderLike = !lastSegment.includes('.') && !lastSegment.includes('*');
    const pathGlob = isFolderLike ? `${pathPart.replace(/\/$/, '')}/page.jay-html` : pathPart;

    return { raw, pathGlob, section };
}

/** A change to be matched against selectors. */
export interface ChangeTarget {
    /** Project-root-relative file path. */
    path: string;
    /** For a `.jay-html` change attributed to a policy-marked part, the innermost marker name. */
    section?: string;
}

/** Does a selector match a change? A path selector (no `#name`) also matches a sectioned change. */
export function selectorMatches(selector: ParsedSelector, target: ChangeTarget): boolean {
    if (!matchGlob(target.path, selector.pathGlob)) return false;
    if (selector.section === undefined) return true;
    return selector.section === target.section;
}

/**
 * Specificity tuple (DL#231 §6.1): `#name` section > more literal path segments > fewer (globs last).
 * Compared lexicographically, higher wins. Equal specificity is resolved by the stricter rule value.
 */
export function selectorSpecificity(selector: ParsedSelector): number[] {
    const segments = selector.pathGlob.split('/');
    const literalSegments = segments.filter((s) => !s.includes('*')).length;
    const hasDoubleStar = segments.includes('**');
    return [
        selector.section !== undefined ? 1 : 0,
        literalSegments,
        hasDoubleStar ? 0 : 1,
        segments.length,
    ];
}

/** Compare two specificity tuples. Returns >0 if `a` is more specific than `b`. */
export function compareSpecificity(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}
