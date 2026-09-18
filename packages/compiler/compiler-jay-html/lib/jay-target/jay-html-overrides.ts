import { parse, type HTMLElement, type Node, NodeType } from 'node-html-parser';
import { WithValidations } from '@jay-framework/compiler-shared';
import { PARENT_SCOPE_PRAGMA } from '../expressions/expression-compiler';

/**
 * Headfull component overrides (DL#181).
 *
 * An `<override>` element nested inside a `<jay:ComponentName>` usage tag targets a `ref` in that
 * component's own template and customizes part of the injected markup at compile time, during the
 * DL#111 template-injection pass. Four operations, all resolved against the target component's own
 * template (so `{binding}` expressions inside an override resolve to the target's ViewState, not the
 * usage site's — DL#181 Q6):
 *
 * - content replace  — `<override ref="x">...</override>`      (replaces the target's children)
 * - attribute merge  — `<override ref="x" alt="..." />`        (merges named attributes, others untouched)
 * - style merge      — `<override ref="x" style="..." />`      (merges per CSS property, not whole-string)
 * - remove           — `<override ref="x" remove />`           (removes the target element and subtree)
 */

export interface OverrideSpec {
    /** The `ref` this override targets; null when the author omitted it (a compile error). */
    ref: string | null;
    /** The `remove` operation — deletes the target element and its subtree. */
    remove: boolean;
    /** Attributes to merge onto the target, excluding `ref` and `remove`. Includes `style`. */
    attributes: Record<string, string>;
    /** The override's inner markup (content replace), or null when the override has no content. */
    content: string | null;
    /** Whether the override carries content to replace the target's children with. */
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
        let remove = false;
        for (const [name, value] of Object.entries(el.attributes)) {
            const lower = name.toLowerCase();
            if (lower === 'ref') {
                ref = value;
            } else if (lower === 'remove') {
                remove = true;
            } else {
                attributes[name] = value;
            }
        }

        const inner = el.innerHTML;
        const hasContent = inner.trim().length > 0;
        specs.push({
            ref,
            remove,
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
 * Apply a list of overrides against a headfull component's body markup. Pure over strings so it can be
 * unit-tested directly: takes the component body's inner HTML and returns the customized HTML paired with
 * any compile validations (missing ref, ambiguous operation). Resolution happens before ViewState/type
 * generation, so no runtime cost (DL#181).
 *
 * @param childBodyInnerHtml - The injected component's body inner HTML (source of truth).
 * @param overrides          - Overrides collected from the usage-site `<jay:Name>` tag.
 * @param componentName      - The component name, for error messages.
 */
export function applyOverrides(
    childBodyInnerHtml: string,
    overrides: OverrideSpec[],
    componentName: string,
): WithValidations<string> {
    const validations: string[] = [];
    const fragment = parse(childBodyInnerHtml);

    for (const override of overrides) {
        if (!override.ref) {
            validations.push(`<override> is missing a "ref" attribute in <jay:${componentName}>.`);
            continue;
        }

        const targets = fragment.querySelectorAll(`[ref="${override.ref}"]`);
        if (targets.length === 0) {
            validations.push(
                `Cannot resolve override: no element with ref="${override.ref}" found in ` +
                    `${componentName}. Add ref="${override.ref}" to the target element in that ` +
                    `component's jay-html, then reference it here.`,
            );
            continue;
        }

        if (override.remove) {
            if (override.hasContent || Object.keys(override.attributes).length > 0) {
                validations.push(
                    `<override ref="${override.ref}" remove> in <jay:${componentName}> cannot also ` +
                        `set content or attributes — remove is exclusive.`,
                );
                continue;
            }
            for (const target of targets) target.remove();
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
            if (override.hasContent) {
                // DL#193 §C: mark the override's bindings as parent-scoped before splicing, so they
                // resolve against the outer (page) scope where the override was authored.
                target.set_content(remapOverrideBindingsToParent(override.content ?? ''));
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
 */
export function applyHeadfullOverrides(
    componentBody: HTMLElement,
    jayTag: HTMLElement,
    componentName: string,
): WithValidations<string> {
    const overrides = parseOverrides(jayTag);
    return applyOverrides(componentBody.innerHTML, overrides, componentName);
}
