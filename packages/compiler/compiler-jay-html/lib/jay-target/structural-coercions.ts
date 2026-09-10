/**
 * Coercion of a structural (Tier 2, DL#187) passthrough instance's ViewState from the raw
 * attribute strings the passthrough echoes (e.g. `status: "success"`, `count: "42"`,
 * `featured: "true"`) to the typed values the inlined template expects (`vs.status ===
 * Status.warning`, numbers, booleans).
 *
 * A Tier 2 passthrough has no `.ts`, so props ≡ tags and each field arrives verbatim as a string
 * regardless of static/dynamic origin. Every render target — server (SSR), hydrate (client adopt),
 * and client element — must apply the SAME type-driven coercion or the outputs diverge (DL#189):
 * SSR coerces `featured: "false"` → `false` and omits the span, while an un-coerced client treats
 * the string `"false"` as truthy and tries to adopt a node that isn't in the DOM. Sharing this
 * logic keeps all three targets in lock-step.
 *
 * Enum coercion handles both value shapes a passthrough can carry:
 *   - a member *name* (static attribute `status="success"`) — the numeric enum's forward map
 *     yields the number: `Status["success"]` → `0`.
 *   - a stringified *number* (dynamic binding `status="{currentStatus}"`, where the page resolves
 *     the enum value `Status.warning` and the binding stringifies `String(1)` → `"1"`) — the
 *     reverse map would return the *name* `"warning"`, so we detect that (result is a string, not
 *     a number) and fall back to `Number("1")` → `1`.
 * Both paths converge on the numeric value. The enum symbol is already imported by every target
 * because the template compares against it (DL#187). String fields need no coercion.
 */

import { isEnumType, JayType } from '@jay-framework/compiler-shared';

export interface StructuralTag {
    tag: string;
    dataType?: JayType;
}

/**
 * Build the per-field coercion expressions for a passthrough instance, reading from `rawVar`
 * (e.g. `vs_badge2_raw` for SSR, `_props` for the client passthrough comp).
 */
export function buildStructuralCoercions(rawVar: string, tags: StructuralTag[]): string[] {
    const coercions: string[] = [];
    for (const tag of tags) {
        const dt = tag.dataType;
        if (!dt) continue;
        const field = `${rawVar}.${tag.tag}`;
        if (isEnumType(dt)) {
            coercions.push(
                `${tag.tag}: typeof (${dt.name} as any)[${field}] === 'number' ? (${dt.name} as any)[${field}] : Number(${field})`,
            );
        } else if (dt.name === 'number') {
            coercions.push(`${tag.tag}: Number(${field})`);
        } else if (dt.name === 'boolean') {
            coercions.push(`${tag.tag}: ${field} === true || ${field} === 'true'`);
        }
    }
    return coercions;
}

/**
 * Build the inline identity-passthrough component definition for a Tier 2 structural instance on
 * the client (hydrate + client element targets). It echoes the supplied props as its ViewState,
 * coercing each field to its contract dataType so the client render/adopt matches the SSR HTML.
 * With no coercible (non-string) tags it degrades to a pure identity passthrough.
 */
export function buildStructuralPassthroughComp(tags: StructuralTag[]): string {
    const coercions = buildStructuralCoercions('_props', tags);
    const renderExpr = coercions.length > 0 ? `({ ..._props, ${coercions.join(', ')} })` : '_props';
    return `{ comp: (_props, _refs) => ({ render: () => ${renderExpr} }) }`;
}
