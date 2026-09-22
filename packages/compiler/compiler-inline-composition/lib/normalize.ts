/**
 * DL#196 §3 — expression/text normalization for drift comparison.
 *
 * The differ compares raw strings (bindings are raw at parse time — the compiler transforms them only
 * later). To avoid *false* drift from formatting, we normalize: whitespace inside `{...}` bindings is
 * removed and runs of literal whitespace collapse to a single space, trimmed at the ends. Two genuinely
 * different expressions still differ after this. Deeper structural equivalence (via the framework's
 * `parseAccessor`) is a possible refinement, not required for correctness.
 */

const BINDING = /\{[^}]*\}/g;

export function normalizeExpr(value: string): string {
    const bindingsCollapsed = value.replace(BINDING, (m) => m.replace(/\s+/g, ''));
    return bindingsCollapsed.replace(/\s+/g, ' ').trim();
}

export function expressionsEqual(a: string, b: string): boolean {
    return normalizeExpr(a) === normalizeExpr(b);
}
