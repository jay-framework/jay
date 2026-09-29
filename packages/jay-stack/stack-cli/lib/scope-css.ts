/**
 * DL#196 — extract a region's `@scope (.<ref>) { … }` block from a page's aggregated CSS.
 *
 * The materialiser wraps each design-system region's copied CSS in `@scope (.<ref>)`. To CSS-drift-check
 * a region, `validate` isolates that region's block and feeds it to `diffCss` (which treats `@scope` as
 * transparent). Brace-matching keeps the extractor dependency-free (no postcss in stack-cli); it respects
 * nested braces from `@media` / `@supports` inside the block.
 *
 * @param css      the page's full CSS (e.g. `JayHtmlSourceFile.css`)
 * @param selector the scope selector, e.g. `.promo`
 * @returns the `@scope (…) { … }` block verbatim, or undefined when no such block exists
 */
export function extractScopeBlock(css: string, selector: string): string | undefined {
    if (!css) return undefined;
    // Match `@scope` + `(` + optional whitespace + the exact selector + optional whitespace + `)`.
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const opener = new RegExp(`@scope\\s*\\(\\s*${escaped}\\s*\\)\\s*\\{`, 'g');
    const match = opener.exec(css);
    if (!match) return undefined;

    const blockStart = match.index;
    // The `{` that `opener` consumed is the last char of the match; start brace-matching from there.
    let depth = 0;
    for (let i = match.index + match[0].length - 1; i < css.length; i++) {
        const ch = css[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return css.slice(blockStart, i + 1);
        }
    }
    return undefined; // unbalanced — treat as absent
}

/**
 * Split aggregated materialiser CSS into its top-level `@scope (selector) { … }` blocks.
 *
 * `materialise` returns each region's copied CSS as an `@scope`-wrapped block, joined by blank lines.
 * `jay-stack sync` merges these into the page's `<style>` per-selector (non-destructive: a selector the
 * page already scopes is left as-is for the author / drift-check to reconcile), so it needs each block
 * paired with its scope selector.
 *
 * @param css aggregated CSS (the `css` field of a `MaterialiseResult`)
 * @returns one entry per `@scope` block, in source order
 */
export function splitScopeBlocks(css: string): Array<{ selector: string; block: string }> {
    const out: Array<{ selector: string; block: string }> = [];
    if (!css) return out;
    const header = /@scope\s*\(\s*([^)]+?)\s*\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = header.exec(css)) !== null) {
        const selector = m[1];
        let depth = 0;
        for (let i = m.index + m[0].length - 1; i < css.length; i++) {
            const ch = css[i];
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    out.push({ selector, block: css.slice(m.index, i + 1) });
                    header.lastIndex = i + 1; // resume past this block (skip its nested braces)
                    break;
                }
            }
        }
    }
    return out;
}
