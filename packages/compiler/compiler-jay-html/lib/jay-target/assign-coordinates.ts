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

import { HTMLElement, NodeType, parse } from 'node-html-parser';

const COORD_ATTR = 'jay-coordinate-base';
export const SCOPE_ATTR = 'jay-scope';

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

        // --- Override slot fragment (<override slot="X">) ---
        // DL#194 §C (Tier 3, Fork C): `<override>` fragments hang off a `<jay:…>` tag as siblings of the
        // injected template. They are owned by the PARENT (page) render, so `assignHeadlessInstance`
        // assigns their content page-scope coordinates separately — skip them here (they would otherwise
        // get child-scope coordinates from this walk).
        if ((element.rawTagName ?? '').toLowerCase() === 'override') continue;

        // --- Headless instance (<jay:xxx>) ---
        // Creates a new scope. The jay-scope attribute marks the boundary.
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            if (options.headlessContractNames.has(contractName)) {
                let ref = element.getAttribute('ref');
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
                    scopeId,
                    options,
                    counter,
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
    parentScopeId: string,
    options: AssignCoordinatesOptions,
    counter: ScopeCounter,
): void {
    // Store the instance coordinate on the jay:xxx tag — still uses the
    // contractName:ref format so compilers can identify the instance.
    // This is in the PARENT scope.
    const instanceCoord = `${parentCoord}/${contractName}:${ref}`;
    element.setAttribute(COORD_ATTR, instanceCoord);

    // Create a new scope for the instance's inline template
    const childScopeId = nextScopeId(counter);
    element.setAttribute(SCOPE_ATTR, childScopeId);

    // Multi-child wrapping normalization (for non-slow pages).
    // For slow-rendered pages, wrapping already happened in resolveHeadlessInstances.
    // For non-slow pages, wrap here before assigning child coordinates.
    //
    // DL#194 §C (Tier 3, Fork C): a coded composite keeps its `<override slot>` content as a SEPARATE
    // top-level child of the `<jay:…>` tag (the compiler splits template body from override fragments,
    // compiling each in a different scope). Exclude override nodes from the wrap so they are not bundled
    // into the template's `display: contents` div — that would hide them from the split and compile the
    // override content in the child scope, breaking parent-scoped bindings.
    const isOverride = (n: any) =>
        n.nodeType === NodeType.ELEMENT_NODE &&
        ((n as HTMLElement).rawTagName ?? '').toLowerCase() === 'override';
    const significantTemplateChildren = element.childNodes.filter(
        (n) =>
            !isOverride(n) &&
            (n.nodeType === NodeType.ELEMENT_NODE ||
                (n.nodeType === NodeType.TEXT_NODE && (n.innerText || '').trim() !== '')),
    );
    if (significantTemplateChildren.length > 1) {
        const wrapper = parse('<div></div>').querySelector('div')!;
        wrapper.setAttribute('style', 'display: contents');
        const overrideChildren = element.childNodes.filter(isOverride);
        const children = element.childNodes.filter((n) => !isOverride(n));
        element.innerHTML = '';
        children.forEach((child) => wrapper.appendChild(child as any));
        element.appendChild(wrapper as any);
        overrideChildren.forEach((child) => element.appendChild(child as any));
    }

    // Walk inline template children in the new scope.
    // The first child element starts a new coordinate path within the child scope.
    // We use a synthetic root coord for the scope — children get S<n>/0, S<n>/0/0, etc.
    // (walkChildren skips `<override>` siblings — those are page-scoped below.)
    walkChildren(element, childScopeId, childScopeId, options, counter);

    // DL#194 §C (Tier 3, Fork C): assign PAGE-scope coordinates to each `<override slot="X">` fragment's
    // content. The fragment is built by the parent render and mounted at the child's `foreignChild`
    // anchor, so its coordinates must resolve in the PAGE coordinate map — rooted at a unique per-slot
    // path `${instanceCoord}/${slotName}` (instanceCoord is unique; slot name is unique per instance).
    const overrideNodes = element.childNodes.filter(
        (n) =>
            n.nodeType === NodeType.ELEMENT_NODE &&
            ((n as HTMLElement).rawTagName ?? '').toLowerCase() === 'override',
    ) as HTMLElement[];
    for (const overrideNode of overrideNodes) {
        const slotName = overrideNode.getAttribute('slot');
        if (!slotName) continue;
        walkChildren(overrideNode, `${instanceCoord}/${slotName}`, parentScopeId, options, counter);
    }
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
                    itemScopeId,
                    options,
                    counter,
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
