/**
 * Coordinate pre-processing for SSR/hydration consistency.
 *
 * Assigns `jay-coordinate-base` and `jay-scope` attributes to all elements
 * that need coordinates, in a single pass before either server or hydrate
 * compilation runs. Both compilers read these attributes instead of computing
 * coordinates independently.
 *
 * See Design Log #103, #106, #126 (scoped coordinates).
 */

import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';

const COORD_ATTR = 'jay-coordinate-base';
export const SCOPE_ATTR = 'jay-scope';

/**
 * DL#206 Phase 3 — the shape of a ref this pass auto-generated for a ref-less region (see
 * {@link assignHeadlessInstance}'s wrap gate and the matching generator in `jay-html-compiler.ts`). The
 * coordinate pass can run more than once on the same tree (hydrate/element pre-assign at
 * `generateElementHydrateFile`, then `renderFunctionImplementation` assigns again); on the second pass the
 * first pass's `AR<n>` placeholder is already on the element, so it must NOT be mistaken for an author's
 * explicit ref — only an explicit ref anchors page CSS `@scope (.<ref>)` and forces the scope-anchor wrap.
 */
const AUTO_REF_PATTERN = /^AR\d+$/;

export interface AssignCoordinatesOptions {
    /** Set of headless contract names (for detecting <jay:xxx> tags) */
    headlessContractNames: Set<string>;
    /** @internal Auto-generated ref counters for headless instances without explicit refs.
     *  Created automatically if not provided. */
    _refCounters?: Map<string, number>;
}

export interface AssignCoordinatesResult {
    /** Serialized DOM with jay-coordinate-base attributes, for debug output */
    debugHtml: string;
}

/**
 * Assign coordinates to a full jay-html string and return the result.
 * Used by the pre-render pipeline so discoverHeadlessInstances gets elements
 * with jay-coordinate-base, matching the hydrate compiler's coordinate format.
 */
export function assignCoordinatesToJayHtml(
    jayHtml: string,
    headlessContractNames: Set<string>,
): string {
    const root = parse(jayHtml, {
        comment: true,
        blockTextElements: { script: true, style: true },
    });
    const body = root.querySelector('body');
    if (!body) return jayHtml;
    assignCoordinates(body, { headlessContractNames });
    return root.toString();
}

/**
 * Global scope counter — monotonically increasing across the entire compilation unit.
 * Depth-first traversal order ensures SSR and hydrate compilers produce the same IDs.
 */
interface ScopeCounter {
    next: number;
}

function nextScopeId(counter: ScopeCounter): string {
    return `S${counter.next++}`;
}

/**
 * DL#206 Phase 3 — is this node our scope-anchor wrapper (a `<div style="display: contents">`)? Used to
 * keep {@link assignHeadlessInstance}'s wrapping idempotent: the coordinate pass can run more than once on
 * the same tree (the hydrate target pre-assigns, then `renderFunctionImplementation` assigns again), and a
 * transitional page may still carry a wrapper the materialiser wrote before Phase 3. In both cases the body
 * is already wrapped — re-wrapping would nest a second anchor.
 */
function isScopeAnchorDiv(node: Node): boolean {
    if (node.nodeType !== NodeType.ELEMENT_NODE) return false;
    const el = node as HTMLElement;
    if (el.tagName?.toLowerCase() !== 'div') return false;
    return (el.getAttribute('style') ?? '').replace(/\s+/g, '').includes('display:contents');
}

/**
 * Assign `jay-coordinate-base` and `jay-scope` attributes to elements in the DOM tree.
 *
 * Must run after slow-render (which resolves slow conditions
 * and wraps multi-child headless inline templates).
 *
 * Mutates the DOM in place. Returns the serialized DOM for debug output.
 */
export function assignCoordinates(
    body: HTMLElement,
    options: AssignCoordinatesOptions,
): AssignCoordinatesResult {
    if (!options._refCounters) options._refCounters = new Map();

    // Find the single root content element inside <body>
    const rootChildren = body.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];

    if (rootChildren.length === 0) return { debugHtml: body.toString() };

    const counter: ScopeCounter = { next: 0 };
    const rootScopeId = nextScopeId(counter); // S0

    const rootElement = rootChildren[0];
    const rootCoord = `${rootScopeId}/0`;
    rootElement.setAttribute(COORD_ATTR, rootCoord);

    walkChildren(rootElement, rootCoord, rootScopeId, options, counter);

    return { debugHtml: body.toString() };
}

/**
 * Walk children of an element and assign scoped coordinates.
 *
 * Coordinates are of the form `S<n>/<path>` where `<path>` is the positional
 * path within the scope. Scope boundaries (headless instances, forEach items)
 * create new scopes with fresh scope IDs.
 *
 * @param parentCoord - The parent element's full coordinate (e.g., "S0/0")
 * @param scopeId - The current scope ID (e.g., "S0")
 */
function walkChildren(
    parent: HTMLElement,
    parentCoord: string,
    scopeId: string,
    options: AssignCoordinatesOptions,
    counter: ScopeCounter,
): void {
    let childCounter = 0;

    for (const child of parent.childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const element = child as HTMLElement;
        const tagName = element.tagName?.toLowerCase();

        // --- Headless instance (<jay:xxx>) ---
        // Creates a new scope. The jay-scope attribute marks the boundary.
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            if (options.headlessContractNames.has(contractName)) {
                let ref = element.getAttribute('ref');
                const explicitRef = !!ref && !AUTO_REF_PATTERN.test(ref);
                if (!ref) {
                    const idx = options._refCounters!.get(contractName) ?? 0;
                    options._refCounters!.set(contractName, idx + 1);
                    ref = `AR${idx}`;
                    element.setAttribute('ref', ref);
                }
                assignHeadlessInstance(
                    element,
                    contractName,
                    ref,
                    parentCoord,
                    options,
                    counter,
                    explicitRef,
                );
                // Don't increment childCounter — jay:xxx is a directive, not a DOM element
                continue;
            }
        }

        // --- forEach ---
        // The forEach container element gets a coordinate in the current scope.
        // Each item iteration creates a new scope (assigned at runtime).
        const forEachAttr = element.getAttribute('forEach');
        if (forEachAttr) {
            const trackBy = element.getAttribute('trackBy');
            if (trackBy) {
                const coord = `${parentCoord}/${childCounter}`;
                element.setAttribute(COORD_ATTR, coord);
                childCounter++;
                // forEach items are scopes — assign a scope ID for the item template
                const itemScopeId = nextScopeId(counter);
                element.setAttribute(SCOPE_ATTR, itemScopeId);
                // Inside forEach, coordinates are relative to the item scope.
                // The forEach element itself is the item root, so children start at S<n>/0.
                walkForEachChildren(element, itemScopeId, options, counter);
                continue;
            }
        }

        // --- Regular element (fully positional within current scope) ---
        const coord = `${parentCoord}/${childCounter}`;
        element.setAttribute(COORD_ATTR, coord);
        childCounter++;

        // Recurse into children within the same scope
        walkChildren(element, coord, scopeId, options, counter);
    }
}

/**
 * Assign coordinates for a headless instance and its inline template children.
 * Creates a new scope for the instance's inline template.
 */
function assignHeadlessInstance(
    element: HTMLElement,
    contractName: string,
    ref: string,
    parentCoord: string,
    options: AssignCoordinatesOptions,
    counter: ScopeCounter,
    explicitRef: boolean,
): void {
    // Store the instance coordinate on the jay:xxx tag — still uses the
    // contractName:ref format so compilers can identify the instance.
    // This is in the PARENT scope.
    const instanceCoord = `${parentCoord}/${contractName}:${ref}`;
    element.setAttribute(COORD_ATTR, instanceCoord);

    // Create a new scope for the instance's inline template
    const childScopeId = nextScopeId(counter);
    element.setAttribute(SCOPE_ATTR, childScopeId);

    // DL#206 Phase 3 — synthesize the scope anchor here, in the shared coordinate pre-processor that
    // all three targets (element / hydrate / server) read, so the wrapper can never diverge between
    // targets and the on-disk source stays the author's body (no `display:contents` wrapper to
    // round-trip through sync/validate). A jay `ref` is never emitted as a DOM class, so page CSS
    // `@scope (.<ref>)` needs a real element to root at: wrap a ref'd region's flattened body in a
    // single `<div class="<ref>" style="display: contents">`. An explicit-ref region always wraps
    // (its ref may be a CSS scope anchor or a parent's donut boundary); a ref-less (auto-ref) region
    // ships no scoped CSS, so it keeps the legacy multi-child-only normalization (one returnable root).
    const significantTemplateChildren = element.childNodes.filter(
        (n) =>
            n.nodeType === NodeType.ELEMENT_NODE ||
            (n.nodeType === NodeType.TEXT_NODE && (n.innerText || '').trim() !== ''),
    );
    const alreadyWrapped =
        significantTemplateChildren.length === 1 &&
        isScopeAnchorDiv(significantTemplateChildren[0]);
    if (!alreadyWrapped && (explicitRef || significantTemplateChildren.length > 1)) {
        const wrapper = parse('<div></div>').querySelector('div')!;
        if (explicitRef) wrapper.setAttribute('class', ref);
        wrapper.setAttribute('style', 'display: contents');
        const children = element.childNodes;
        element.innerHTML = '';
        children.forEach((child) => wrapper.appendChild(child as any));
        element.appendChild(wrapper as any);
    }

    // Walk inline template children in the new scope.
    // The first child element starts a new coordinate path within the child scope.
    // We use a synthetic root coord for the scope — children get S<n>/0, S<n>/0/0, etc.
    walkChildren(element, childScopeId, childScopeId, options, counter);
}

/**
 * Walk children inside a forEach item template, using the item's scope ID.
 * All children get coordinates relative to the item scope.
 */
function walkForEachChildren(
    parent: HTMLElement,
    itemScopeId: string,
    options: AssignCoordinatesOptions,
    counter: ScopeCounter,
): void {
    let childCounter = 0;

    for (const child of parent.childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const element = child as HTMLElement;
        const tagName = element.tagName?.toLowerCase();

        // Headless instance inside forEach — creates a new scope
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            if (options.headlessContractNames.has(contractName)) {
                let ref = element.getAttribute('ref');
                const explicitRef = !!ref && !AUTO_REF_PATTERN.test(ref);
                if (!ref) {
                    const counterKey = `forEach/${contractName}`;
                    const idx = options._refCounters!.get(counterKey) ?? 0;
                    options._refCounters!.set(counterKey, idx + 1);
                    ref = `AR${idx}`;
                    element.setAttribute('ref', ref);
                }
                // The headless instance's parent coord is the item scope root
                assignHeadlessInstance(
                    element,
                    contractName,
                    ref,
                    itemScopeId,
                    options,
                    counter,
                    explicitRef,
                );
                continue;
            }
        }

        // Nested forEach — assign container coordinate, create a new item scope
        const forEachAttr = element.getAttribute('forEach');
        if (forEachAttr) {
            const trackBy = element.getAttribute('trackBy');
            if (trackBy) {
                const coord = `${itemScopeId}/${childCounter}`;
                element.setAttribute(COORD_ATTR, coord);
                childCounter++;
                const nestedItemScopeId = nextScopeId(counter);
                element.setAttribute(SCOPE_ATTR, nestedItemScopeId);
                walkForEachChildren(element, nestedItemScopeId, options, counter);
                continue;
            }
        }

        // Regular element within the forEach item scope
        const coord = `${itemScopeId}/${childCounter}`;
        element.setAttribute(COORD_ATTR, coord);
        childCounter++;

        walkChildren(element, coord, itemScopeId, options, counter);
    }
}
