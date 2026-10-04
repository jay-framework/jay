/**
 * DL#196 — helpers for the page's aggregated `@scope (…) { … }` CSS: extract a region's block, split blocks,
 * tokenize the whole sheet, and normalize a block body for equality.
 *
 * The materialiser wraps each design-system region's copied CSS in `@scope (.<ref>)`, coalescing instances
 * of the same template into one `<forgiving-selector-list>` block (`@scope (.a, .b)`, §4/§5). Brace-matching
 * keeps these dependency-free (no postcss in stack-cli); nested braces from `@media` / `@supports` inside a
 * block are respected.
 */

/** One `@scope` block found in a sheet, with its parsed member selectors. */
export interface ScopeBlock {
    /** the raw scope-start list text, e.g. `.a, .b`. */
    selector: string;
    /** the parsed member selectors, e.g. `['.a', '.b']`. */
    selectors: string[];
    /** DL#203 — the scoping-limit (donut) `to (…)` members, e.g. `['.badge']`; empty when there is no limit. */
    to: string[];
    /** the block verbatim, `@scope (…) [to (…)] { … }`. */
    block: string;
}

/** A segment of a CSS sheet in source order: a `@scope` block, or the raw text between blocks. */
export type CssSegment = { type: 'raw'; text: string } | ({ type: 'scope' } & ScopeBlock);

/**
 * Extract a region's block from a page's aggregated CSS.
 *
 * A block's scope-start is a `<forgiving-selector-list>` — the requested selector may be the sole entry or
 * *one member* of a comma-joined list (`@scope (.a, .b)`). Scan every block and return the one whose list
 * contains `selector`, so a coalesced block still answers "the block for `.<ref>`" with that region's body.
 *
 * @param css      the page's full CSS (e.g. `JayHtmlSourceFile.css`)
 * @param selector the scope selector, e.g. `.promo`
 * @returns the `@scope (…) { … }` block verbatim, or undefined when no such block exists
 */
export function extractScopeBlock(css: string, selector: string): string | undefined {
    for (const { selectors, block } of splitScopeBlocks(css)) {
        if (selectors.includes(selector)) return block;
    }
    return undefined;
}

/**
 * Tokenize a CSS sheet into ordered segments — each top-level `@scope` block plus the raw text around it.
 * Reconciling the page `<style>` (coalescing while preserving overrides and unrelated CSS) needs the gaps,
 * not just the blocks. An unbalanced `@scope` opener terminates the scan (its tail becomes a raw segment).
 */
export function tokenizeCss(css: string): CssSegment[] {
    const out: CssSegment[] = [];
    if (!css) return out;
    // Scope-start, with an optional DL#203 scoping limit: `@scope (sel) [to (limit)] {`.
    const header = /@scope\s*\(\s*([^)]+?)\s*\)(?:\s*to\s*\(\s*([^)]+?)\s*\))?\s*\{/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = header.exec(css)) !== null) {
        let depth = 0;
        let end = -1;
        for (let i = m.index + m[0].length - 1; i < css.length; i++) {
            const ch = css[i];
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        if (end === -1) break; // unbalanced — leave the rest as a trailing raw segment
        if (m.index > last) out.push({ type: 'raw', text: css.slice(last, m.index) });
        const selector = m[1];
        const selectors = selector
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        const to = (m[2] ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        out.push({ type: 'scope', selector, selectors, to, block: css.slice(m.index, end) });
        last = end;
        header.lastIndex = end;
    }
    if (last < css.length) out.push({ type: 'raw', text: css.slice(last) });
    return out;
}

/**
 * Split aggregated CSS into its top-level `@scope (selector) { … }` blocks, in source order. Each entry
 * carries the raw list text (`selector`) and its parsed members (`selectors`) for per-member merging.
 */
export function splitScopeBlocks(css: string): ScopeBlock[] {
    return tokenizeCss(css)
        .filter((s): s is CssSegment & { type: 'scope' } => s.type === 'scope')
        .map(({ selector, selectors, to, block }) => ({ selector, selectors, to, block }));
}

/** The declarations inside a `@scope (…) [to (…)] { … }` block (its body), un-normalized. */
export function scopeInnerBody(block: string): string {
    return block
        .replace(/^@scope\s*\([^)]*\)(?:\s*to\s*\([^)]*\))?\s*\{/, '')
        .replace(/\}\s*$/, '');
}

/**
 * Normalize a CSS body for equality: collapse whitespace, tighten around punctuation, drop a trailing `;`.
 * This makes a prettified page block compare equal to the raw template CSS the materialiser emits (so an
 * un-overridden block coalesces), while any declaration/value change — or an added `/* jay:override *​/`
 * comment — makes it compare unequal (so an override keeps its own block).
 */
export function normalizeCssBody(body: string): string {
    return body
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
}
