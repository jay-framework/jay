/**
 * Build-time utilities for coordinate template compilation.
 *
 * Coordinates may contain $placeholder segments (e.g. "0/$_id/1") that
 * reference forEach trackBy variables. These utilities compile templates
 * into JS string concatenation expressions — no runtime dependency.
 */

/**
 * Compile a coordinate template with $placeholder syntax into a JS expression string.
 *
 * Static templates (no placeholders) return a quoted string literal.
 * Dynamic templates compile to string concatenation expressions.
 *
 * @param template - Coordinate template, e.g. "0/$_id/1" or "product-card:0/0"
 * @param varMappings - Maps placeholder names to JS expressions, e.g. { _id: "vs1._id" }
 * @returns A JS expression string that evaluates to the final coordinate value
 *
 * @example
 * // Static (no placeholders):
 * compileCoordinateExpr("product-card:0/0", {})
 * // → "'product-card:0/0'"
 *
 * // Dynamic (with placeholder):
 * compileCoordinateExpr("0/$_id/1", { _id: "vs1._id" })
 * // → "'0/' + escapeAttr(String(vs1._id)) + '/1'"
 *
 * // Placeholder at start:
 * compileCoordinateExpr("$_id/product-card:0/0", { _id: "vs1._id" })
 * // → "escapeAttr(String(vs1._id)) + '/product-card:0/0'"
 */
export function compileCoordinateExpr(
    template: string,
    varMappings: Record<string, string>,
): string {
    // Fast path: no placeholders
    if (!template.includes('$')) {
        return `'${template}'`;
    }

    // Split on $placeholder segments
    // Match $word patterns (alphanumeric + underscore)
    const parts: string[] = [];
    let remaining = template;

    while (remaining.length > 0) {
        const match = remaining.match(/\$([a-zA-Z_]\w*)/);
        if (!match) {
            // No more placeholders — rest is literal
            parts.push(`'${remaining}'`);
            break;
        }

        const placeholderName = match[1];
        const placeholderStart = match.index!;

        // Add literal prefix (if any)
        if (placeholderStart > 0) {
            parts.push(`'${remaining.substring(0, placeholderStart)}'`);
        }

        // Add the variable expression
        const varExpr = varMappings[placeholderName];
        if (varExpr === undefined) {
            throw new Error(
                `compileCoordinateExpr: no mapping for placeholder "$${placeholderName}" in template "${template}"`,
            );
        }
        parts.push(`escapeAttr(String(${varExpr}))`);

        remaining = remaining.substring(placeholderStart + match[0].length);
    }

    return parts.join(' + ');
}

/**
 * Check if a coordinate template contains dynamic placeholders.
 */
export function isStaticCoordinate(template: string): boolean {
    return !template.includes('$');
}
