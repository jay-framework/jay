/**
 * Coercion of a structural (DL#196) passthrough instance's ViewState from the raw
 * attribute strings the passthrough echoes (e.g. `status: "success"`, `count: "42"`,
 * `featured: "true"`) to the typed values the inlined template expects (`vs.status ===
 * Status.warning`, numbers, booleans).
 *
 * A structural passthrough has no `.ts`, so props ≡ tags and each field arrives verbatim as a string
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
 * because the template compares against it (DL#196). String fields need no coercion.
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
 * Build the inline identity-passthrough component definition for a structural passthrough instance on
 * the client (hydrate + client element targets). It echoes the supplied props verbatim as its
 * ViewState — no coercion.
 *
 * Unlike the server (which reads raw attribute strings out of `__headlessInstances` and must coerce
 * them with {@link buildStructuralCoercions}), the client receives props from the generated
 * `childComp(...)` factory, which the jay-html compiler already emits with compile-time coercion:
 * static enum/number/boolean attributes land as typed literals (`Status.success`, `42`, `true`) and
 * `{binding}` props carry their source ViewState's type. Re-coercing here would be redundant and, for
 * bindings, ill-typed — `_props.field` is the typed value (or a `Getter`), not a string to `Number()`
 * or index an enum with. `tags` is accepted for call-site symmetry with the server path but unused.
 *
 * DL#193 Phase 3 (ref forwarding): the passthrough spreads `_refs` into its render result so the
 * structural component's named inner child-component refs surface on the usage-site instance's public
 * API (`refs.signupCard.cta`). `getPublicAPI()` returns a plain object, so spreading is a pure
 * passthrough — each forwarded ref keeps its original component-ref shape (no event re-basing). When
 * the structural component has no forwardable refs, `_refs` is `{}` and the spread is a no-op.
 */
export function buildStructuralPassthroughComp(_tags: StructuralTag[]): string {
    return `{ comp: (_props, _refs) => ({ render: () => _props, ..._refs }) }`;
}
