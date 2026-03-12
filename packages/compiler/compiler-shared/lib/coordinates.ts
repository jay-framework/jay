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

// ============================================================================
// __headlessInstances key computation
// ============================================================================

/**
 * Compute the `__headlessInstances` key for a headless instance.
 *
 * The key format differs by context:
 * - **Static**: `"product-card:0"` (just the coordinate suffix)
 * - **forEach**: `"trackByValue,product-card:0"` (comma-separated, matching Array.toString())
 * - **slowForEach**: `"p1/product-card:0"` (slash-separated, same as DOM coordinate)
 *
 * This function is used by both:
 * - Server runtime (dev-server) when storing data in `__headlessInstances`
 * - Client compiler when generating the key lookup in `makeHeadlessInstanceComponent`
 *
 * @param coordinateSuffix - The instance's coordinate suffix, e.g. "product-card:0"
 * @param context - The context in which the instance appears
 * @param prefix - For slowForEach: the jayTrackBy value (e.g. "p1").
 *   For forEach: not used (key is computed at runtime from trackBy values).
 * @returns For static/slowForEach: a literal key string.
 *   For forEach: undefined (key must be computed at runtime).
 */
export function computeInstanceKey(
    coordinateSuffix: string,
    context: 'static' | 'forEach' | 'slowForEach',
    prefix?: string,
): string | undefined {
    switch (context) {
        case 'static':
            return coordinateSuffix;
        case 'slowForEach':
            return `${prefix}/${coordinateSuffix}`;
        case 'forEach':
            // forEach keys are computed at runtime: [trackByValue, suffix].toString()
            // The server uses: [trackByValue, coordinateSuffix].toString()
            // The client uses: (dataIds) => dataIds.join(',')
            // Both produce: "trackByValue,coordinateSuffix"
            return undefined;
    }
}

/**
 * Compile a forEach instance key expression for generated code.
 *
 * For the server target, produces a JS expression that computes the key
 * at runtime using the trackBy variable.
 *
 * For the client target (hydrate adopt path), the key is computed by
 * `(dataIds) => dataIds.join(',')` — the coordinateBase already includes
 * the suffix via `childCompHydrate`'s `forInstance` call.
 *
 * @param coordinateSuffix - e.g. "product-card:0"
 * @param trackByExpr - JS expression for the trackBy value, e.g. "vs1._id"
 * @returns A JS expression string that evaluates to the key
 *
 * @example
 * compileForEachInstanceKeyExpr("product-card:0", "vs1._id")
 * // → "String(vs1._id) + ',product-card:0'"
 */
export function compileForEachInstanceKeyExpr(
    coordinateSuffix: string,
    trackByExpr: string,
): string {
    return `String(${trackByExpr}) + ',${coordinateSuffix}'`;
}

/**
 * Runtime computation of a forEach instance key.
 *
 * Used by the dev server when storing data in `__headlessInstances`.
 * Produces the same format as `compileForEachInstanceKeyExpr` generates
 * at compile time: `"trackByValue,coordinateSuffix"`.
 *
 * @param trackByValue - The resolved trackBy value for the current item
 * @param coordinateSuffix - e.g. "product-card:0"
 */
export function computeForEachInstanceKey(trackByValue: string, coordinateSuffix: string): string {
    return [trackByValue, coordinateSuffix].toString();
}
