import { parse, type HTMLElement, type Node, NodeType } from 'node-html-parser';
import { WithValidations } from '@jay-framework/compiler-shared';
import { PARENT_SCOPE_PRAGMA } from '../expressions/expression-compiler';

/**
 * Headfull component overrides (DL#181, narrowed by DL#194).
 *
 * An `<override>` element nested inside a `<jay:ComponentName>` usage tag customizes part of the
 * injected markup at compile time, during the DL#111 template-injection pass. DL#194 splits it into
 * **two forms, selected by the addressing attribute** (`ref=` vs `slot=`), not by presence of children:
 *
 * - **Attribute form** — `<override ref="x" alt="…" style="…" />` merges named attributes onto the
 *   *existing* element (others untouched; `style` per-CSS-property via cascade). Allowed on **any**
 *   ref, all tiers — it preserves element identity/type, so a coded component's `refs.x` still
 *   resolves to the same element. This is the only part of DL#181 retained.
 * - **Content form** — `<override slot="x">…children…</override>` fills a declared `type: slot` region
 *   (the slot's template anchor is the element marked `ref="x"`). Its bindings resolve at the **parent
 *   (usage-site)** scope (DL#193 §C). An empty content form renders the slot with nothing.
 *
 * DL#194 dropped DL#181's `remove` operation (use an empty slot fill) and its "content-replace on any
 * ref" (content now requires a declared slot — prevention-first, so a coded component's ref types are
 * never silently broken). `remove` is no longer a keyword; if written it is treated as an ordinary
 * attribute.
 */

export interface OverrideSpec {
    /** The `ref` this override targets (attribute form); null when addressing by slot or omitted. */
    ref: string | null;
    /** The `slot` this override fills (content form); null when addressing by ref or omitted. */
    slot: string | null;
    /** Attributes to merge onto the target, excluding `ref`/`slot`. Includes `style`. */
    attributes: Record<string, string>;
    /** The override's inner markup (slot content), or null when the override has no content. */
    content: string | null;
    /** Whether the override carries content. */
    hasContent: boolean;
}

const OVERRIDE_TAG = 'override';

/**
 * DL#193 Phase 3 refinement — provenance marker stamped on every child-component (`<jay:…>`) tag
 * that an override *injects* into a composite's body. The compiler reads it to decide that the
 * injected component's forwarded ref must carry the OUTER (override authoring) scope rather than the
 * composite's own ViewState — the override author knows the outer scope, not the component's
 * internals (§C). A plain inner `<jay:Counter ref="cta">` authored in the composite's OWN template
 * carries no marker and keeps composite scope. The marker is a static literal attribute, stripped by
 * codegen (ignored in {@link renderChildCompProps} and never emitted).
 */
export const OVERRIDE_INJECTED_MARKER = 'jay-from-override';

/**
 * DL#194 §C (Tier 3, Fork C) — provenance marker stamped by the parser on a coded composite's slot
 * anchor when that slot is FILLED by an `<override slot="X">`. It replaces the anchor's `ref` (a slot
 * has no ref) and clears its default content. Codegen reads it to emit `foreignChild(slots.X)` at the
 * anchor — the slot's content is a parent-owned fragment mounted into the child DOM, updated by the
 * parent (never the child). An unfilled slot carries no marker: its default content renders inline
 * with the `ref` simply removed.
 */
export const FOREIGN_SLOT_MARKER = 'jay-foreign-slot';

/**
 * Attributes the jay-html compiler reads literally (never through the expression parser), so their
 * values must NOT be marked with the parent-scope pragma — doing so would corrupt a ref name, a
 * trackBy field, or an internal coordinate/scope marker.
 */
const LITERAL_ATTRS = new Set(['ref', 'trackby', 'jay-coordinate-base', 'jay-scope']);

/**
 * Attributes whose whole value is an expression even without `{…}` braces (`forEach="items"`,
 * `if="isOpen"`). These always funnel through the expression parser, so their value must be marked
 * regardless of braces. Every other attribute is an expression only when it contains a `{…}`
 * binding; a brace-less value is emitted verbatim and would leak the pragma if marked.
 */
const EXPRESSION_ATTRS = new Set(['if', 'foreach']);

/**
 * DL#193 §C (Phase 2a) — mark override content as authored in the parent (outer) scope.
 *
 * Override content is authored in the OUTER (page) scope but spliced into the target component, so
 * its bindings must resolve against the page scope, not the child's ViewState. Rather than persist
 * provenance, the compiler prefixes each binding *location* (every text node and every non-literal
 * attribute value) with the {@link PARENT_SCOPE_PRAGMA}. A single mark at the start of a value
 * covers all `{…}` bindings in it; {@link doParse} strips the pragma and resolves the whole value
 * against a `withParentShift(1)` scope (Capability A). Handing the field-vs-enum/class distinction
 * to the real expression parser means compound expressions (`{status == active ? cls}`) resolve
 * correctly — only genuine field accessors climb.
 *
 * The author never writes the pragma (that authoring syntax was rejected in Q3); it is injected
 * here. Because it rides Capability A, override outer-data bindings are client-target only (React
 * and server targets reject parent bindings, matching Capability A's limits). Overrides that
 * introduce their own `forEach` scope inside the content are out of Phase 2a scope.
 */
export function remapOverrideBindingsToParent(content: string): string {
    const fragment = parse(content);
    markParentScope(fragment);
    return fragment.toString();
}

/** Recursively prefix text nodes and non-literal attribute values with the parent-scope pragma. */
function markParentScope(node: Node): void {
    for (const child of node.childNodes) {
        if (child.nodeType === NodeType.TEXT_NODE) {
            // Only mark text that carries a binding — static text has nothing to resolve.
            if (child.rawText.includes('{')) child.rawText = PARENT_SCOPE_PRAGMA + child.rawText;
        } else if (child.nodeType === NodeType.ELEMENT_NODE) {
            const el = child as HTMLElement;
            // DL#193 Phase 3 refinement: stamp injected child-component tags with the provenance
            // marker so codegen re-bases their forwarded refs to the outer (override) scope. Only
            // `<jay:…>` component tags forward refs; marking plain HTML elements would leak the
            // attribute into their generated `e(...)` call, so restrict it to component tags.
            if ((el.rawTagName ?? '').toLowerCase().startsWith('jay:')) {
                el.setAttribute(OVERRIDE_INJECTED_MARKER, '');
            }
            for (const [name, value] of Object.entries(el.attributes)) {
                const lower = name.toLowerCase();
                if (LITERAL_ATTRS.has(lower)) continue;
                // Only mark attributes that actually carry a binding: a `{…}` interpolation, or a
                // brace-less expression attribute (`forEach`/`if`). A static value (no `{…}`) is
                // emitted verbatim and never passes through the expression parser that strips the
                // pragma, so marking it would leak `@jay:parent ` into the output.
                if (!value.includes('{') && !EXPRESSION_ATTRS.has(lower)) continue;
                el.setAttribute(name, PARENT_SCOPE_PRAGMA + value);
            }
            markParentScope(el);
        }
    }
}

/**
 * Collect the `<override>` specs that are *direct* children of a `<jay:Name>` usage tag. Only direct
 * children belong to this tag — an `<override>` nested inside another `<jay:...>` in an override's own
 * content targets that nested component and is resolved in its own injection pass.
 */
export function parseOverrides(jayTag: HTMLElement): OverrideSpec[] {
    const specs: OverrideSpec[] = [];
    for (const child of jayTag.childNodes) {
        const el = child as HTMLElement;
        if (el.nodeType !== 1) continue;
        if ((el.rawTagName ?? '').toLowerCase() !== OVERRIDE_TAG) continue;

        const attributes: Record<string, string> = {};
        let ref: string | null = null;
        let slot: string | null = null;
        for (const [name, value] of Object.entries(el.attributes)) {
            const lower = name.toLowerCase();
            if (lower === 'ref') {
                ref = value;
            } else if (lower === 'slot') {
                slot = value;
            } else {
                attributes[name] = value;
            }
        }

        const inner = el.innerHTML;
        const hasContent = inner.trim().length > 0;
        specs.push({
            ref,
            slot,
            attributes,
            content: hasContent ? inner : null,
            hasContent,
        });
    }
    return specs;
}

/**
 * Whether a `<jay:Name>` usage tag contains any `<override>` direct children. Used to distinguish an
 * override usage from a plain empty tag (inject the component body) or a tag with other content.
 */
export function hasOverrides(jayTag: HTMLElement): boolean {
    for (const child of jayTag.childNodes) {
        const el = child as HTMLElement;
        if (el.nodeType === 1 && (el.rawTagName ?? '').toLowerCase() === OVERRIDE_TAG) return true;
    }
    return false;
}

function parseStyle(style: string | undefined): Map<string, string> {
    const map = new Map<string, string>();
    for (const part of (style ?? '').split(';')) {
        const idx = part.indexOf(':');
        if (idx === -1) continue;
        const prop = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (prop) map.set(prop, value);
    }
    return map;
}

/** Merge two `style` strings per CSS property; the incoming (override) value wins per property. */
function mergeStyle(existing: string | undefined, incoming: string): string {
    const merged = parseStyle(existing);
    for (const [prop, value] of parseStyle(incoming)) merged.set(prop, value);
    return [...merged].map(([prop, value]) => `${prop}: ${value}`).join('; ');
}

/**
 * Apply a list of overrides against a headfull component's body markup (DL#181, narrowed by DL#194).
 * Pure over strings so it can be unit-tested directly: takes the component body's inner HTML and returns
 * the customized HTML paired with any compile validations. Resolution happens before ViewState/type
 * generation, so no runtime cost.
 *
 * Two forms, selected by the addressing attribute:
 * - `<override ref="X" … />` — merge attributes onto the existing element (any ref; no content allowed).
 * - `<override slot="X">…</override>` — fill declared slot `X` (its template anchor is `ref="X"`).
 *
 * @param childBodyInnerHtml - The injected component's body inner HTML (source of truth).
 * @param overrides          - Overrides collected from the usage-site `<jay:Name>` tag.
 * @param componentName      - The component name, for error messages.
 * @param slotNames          - Names of the component's declared `type: slot` tags. When provided, a
 *                             `slot=` that isn't a declared slot is a compile error (prevention-first).
 *                             Omitted on best-effort paths that don't load the contract.
 */
export function applyOverrides(
    childBodyInnerHtml: string,
    overrides: OverrideSpec[],
    componentName: string,
    slotNames?: Set<string>,
): WithValidations<string> {
    const validations: string[] = [];
    const fragment = parse(childBodyInnerHtml);

    for (const override of overrides) {
        // Exactly one addressing attribute — `slot=` (content form) xor `ref=` (attribute form).
        if (override.slot !== null && override.ref !== null) {
            validations.push(
                `<override> in <jay:${componentName}> cannot set both "slot" and "ref" — ` +
                    `use slot="X" to fill a slot, or ref="X" to merge attributes.`,
            );
            continue;
        }
        if (override.slot === null && override.ref === null) {
            validations.push(
                `<override> is missing a "slot" or "ref" attribute in <jay:${componentName}>.`,
            );
            continue;
        }

        // Content form — `<override slot="X">…</override>` fills a declared slot.
        if (override.slot !== null) {
            const slotName = override.slot;
            if (slotNames && !slotNames.has(slotName)) {
                validations.push(
                    `<override slot="${slotName}"> — no slot "${slotName}" in ${componentName}. ` +
                        `Declare it as type: slot, or use <override ref="${slotName}" …/> to ` +
                        `restyle an existing element.`,
                );
                continue;
            }
            if (Object.keys(override.attributes).length > 0) {
                validations.push(
                    `<override slot="${slotName}"> in <jay:${componentName}> cannot also set ` +
                        `attributes — use <override ref="${slotName}" …/> for attribute merges.`,
                );
                continue;
            }
            const targets = fragment.querySelectorAll(`[ref="${slotName}"]`);
            if (targets.length === 0) {
                validations.push(
                    `Cannot resolve slot override: no element with ref="${slotName}" found in ` +
                        `${componentName}. Mark the slot's target element with ref="${slotName}" in ` +
                        `that component's jay-html.`,
                );
                continue;
            }
            for (const target of targets) {
                // DL#193 §C: mark the override's bindings as parent-scoped before splicing, so they
                // resolve against the outer (page) scope where the override was authored. An empty
                // content form clears the slot (the replacement for DL#181 `remove`).
                target.set_content(remapOverrideBindingsToParent(override.content ?? ''));
            }
            continue;
        }

        // Attribute form — `<override ref="X" … />` merges attributes onto the existing element.
        const refName = override.ref!;
        if (override.hasContent) {
            validations.push(
                `<override ref="${refName}"> in <jay:${componentName}> cannot have content — ` +
                    `use <override slot="${refName}">…</override> to fill a slot with content.`,
            );
            continue;
        }
        const targets = fragment.querySelectorAll(`[ref="${refName}"]`);
        if (targets.length === 0) {
            validations.push(
                `Cannot resolve override: no element with ref="${refName}" found in ` +
                    `${componentName}. Add ref="${refName}" to the target element in that ` +
                    `component's jay-html, then reference it here.`,
            );
            continue;
        }
        for (const target of targets) {
            for (const [name, value] of Object.entries(override.attributes)) {
                if (name.toLowerCase() === 'style') {
                    target.setAttribute('style', mergeStyle(target.getAttribute('style'), value));
                } else {
                    target.setAttribute(name, value);
                }
            }
        }
    }

    return new WithValidations(fragment.toString(), validations);
}

/**
 * Resolve overrides for a single `<jay:Name>` usage tag against the injected component body. Combines
 * {@link parseOverrides} and {@link applyOverrides} for the two injection call sites in the parser.
 *
 * @param componentBody - The parsed component body element (its inner HTML is the source of truth).
 * @param jayTag        - The usage-site tag whose `<override>` children are applied.
 * @param componentName - The component name, for error messages.
 * @param slotNames     - Declared `type: slot` tag names (see {@link applyOverrides}); optional on
 *                        best-effort paths that don't load the contract.
 */
export function applyHeadfullOverrides(
    componentBody: HTMLElement,
    jayTag: HTMLElement,
    componentName: string,
    slotNames?: Set<string>,
): WithValidations<string> {
    const overrides = parseOverrides(jayTag);
    return applyOverrides(componentBody.innerHTML, overrides, componentName, slotNames);
}
