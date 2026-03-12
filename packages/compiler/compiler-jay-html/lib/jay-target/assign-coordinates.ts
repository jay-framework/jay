/**
 * Coordinate pre-processing for SSR/hydration consistency.
 *
 * Assigns `jay-coordinate-base` attributes to all elements that need coordinates,
 * in a single pass before either server or hydrate compilation runs.
 * Both compilers read this attribute instead of computing coordinates independently.
 *
 * See Design Log #103.
 */

import { HTMLElement, NodeType, parse } from 'node-html-parser';

const COORD_ATTR = 'jay-coordinate-base';

export interface AssignCoordinatesOptions {
    /** Set of headless contract names (for detecting <jay:xxx> tags) */
    headlessContractNames: Set<string>;
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
 * Scope state tracks counters for coordinate assignment within a scope.
 * Each scope (page root, headless instance, forEach item) has its own counters.
 *
 * All coordinates are fully positional — refs are ignored for coordinate purposes.
 * This applies to both regular elements and headless instances.
 */
interface ScopeState {
    /** Counter for regular child elements (including those with refs) */
    childCounter: number;
    /** Per-contract counters for headless instances */
    headlessCounters: Map<string, number>;
}

function newScope(): ScopeState {
    return { childCounter: 0, headlessCounters: new Map() };
}

/**
 * Assign `jay-coordinate-base` attributes to elements in the DOM tree.
 *
 * Must run after slow-render (which resolves slow conditions, unrolls slowForEach,
 * and wraps multi-child headless inline templates).
 *
 * Mutates the DOM in place. Returns the serialized DOM for debug output.
 */
export function assignCoordinates(
    body: HTMLElement,
    options: AssignCoordinatesOptions,
): AssignCoordinatesResult {
    // Find the single root content element inside <body>
    const rootChildren = body.childNodes.filter(
        (n) => n.nodeType === NodeType.ELEMENT_NODE,
    ) as HTMLElement[];

    if (rootChildren.length === 0) return { debugHtml: body.toString() };

    const rootElement = rootChildren[0];
    rootElement.setAttribute(COORD_ATTR, '0');

    walkChildren(rootElement, '0', options, newScope());

    return { debugHtml: body.toString() };
}

/**
 * Walk children of an element and assign coordinates.
 */
function walkChildren(
    parent: HTMLElement,
    parentCoord: string,
    options: AssignCoordinatesOptions,
    scope: ScopeState,
): void {
    for (const child of parent.childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const element = child as HTMLElement;
        const tagName = element.tagName?.toLowerCase();

        // --- Headless instance (<jay:xxx>) ---
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            if (options.headlessContractNames.has(contractName)) {
                const instanceIndex = scope.headlessCounters.get(contractName) ?? 0;
                scope.headlessCounters.set(contractName, instanceIndex + 1);
                assignHeadlessInstance(element, contractName, instanceIndex, parentCoord, options);
                // Don't increment childCounter — jay:xxx is a directive, not a DOM element
                continue;
            }
        }

        // --- forEach ---
        const forEachAttr = element.getAttribute('forEach');
        if (forEachAttr) {
            const trackBy = element.getAttribute('trackBy');
            if (trackBy) {
                const coord = `${parentCoord}/${scope.childCounter}`;
                element.setAttribute(COORD_ATTR, coord);
                scope.childCounter++;
                walkForEachChildren(element, `$${trackBy}`, options);
                continue;
            }
        }

        // --- slowForEach ---
        const slowForEachAttr = element.getAttribute('slowForEach');
        if (slowForEachAttr) {
            const jayTrackBy = element.getAttribute('jayTrackBy');
            if (jayTrackBy) {
                element.setAttribute(COORD_ATTR, jayTrackBy);
                walkChildren(element, jayTrackBy, options, newScope());
                // Don't increment — slowForEach items use jayTrackBy as coordinate
                continue;
            }
        }

        // --- Regular element (fully positional, refs ignored for coordinates) ---
        const coord = `${parentCoord}/${scope.childCounter}`;
        element.setAttribute(COORD_ATTR, coord);
        scope.childCounter++;

        // Recurse into children
        walkChildren(element, coord, options, newScope());
    }
}

/**
 * Assign coordinates for a headless instance and its inline template children.
 * Uses a positional counter (not the ref attribute) for the coordinate index.
 */
function assignHeadlessInstance(
    element: HTMLElement,
    contractName: string,
    instanceIndex: number,
    parentCoord: string,
    options: AssignCoordinatesOptions,
): void {
    const instanceCoord = `${parentCoord}/${contractName}:${instanceIndex}`;
    // Store the instance coordinate on the jay:xxx tag for compilers to read.
    element.setAttribute(COORD_ATTR, instanceCoord);

    // Multi-child wrapping normalization (for non-slow pages).
    // For slow-rendered pages, wrapping already happened in resolveHeadlessInstances.
    // For non-slow pages, wrap here before assigning child coordinates.
    const significantChildren = element.childNodes.filter(
        (n) =>
            n.nodeType === NodeType.ELEMENT_NODE ||
            (n.nodeType === NodeType.TEXT_NODE && (n.innerText || '').trim() !== ''),
    );
    if (significantChildren.length > 1) {
        const wrapper = parse('<div></div>').querySelector('div')!;
        const children = [...element.childNodes];
        element.innerHTML = '';
        children.forEach((child) => wrapper.appendChild(child as any));
        element.appendChild(wrapper as any);
    }

    // Walk inline template children with the instance coordinate as scope
    walkChildren(element, instanceCoord, options, newScope());
}

/**
 * Walk children inside a forEach, using $placeholder prefix for coordinates.
 */
function walkForEachChildren(
    parent: HTMLElement,
    itemPrefix: string,
    options: AssignCoordinatesOptions,
): void {
    const scope = newScope();

    for (const child of parent.childNodes) {
        if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
        const element = child as HTMLElement;
        const tagName = element.tagName?.toLowerCase();

        // Headless instance inside forEach
        if (tagName?.startsWith('jay:')) {
            const contractName = tagName.substring(4);
            if (options.headlessContractNames.has(contractName)) {
                const instanceIndex = scope.headlessCounters.get(contractName) ?? 0;
                scope.headlessCounters.set(contractName, instanceIndex + 1);
                const instanceCoord = `${itemPrefix}/${contractName}:${instanceIndex}`;
                element.setAttribute(COORD_ATTR, instanceCoord);
                walkChildren(element, instanceCoord, options, newScope());
                continue;
            }
        }

        const coord = `${itemPrefix}/${scope.childCounter}`;
        element.setAttribute(COORD_ATTR, coord);
        scope.childCounter++;

        walkChildren(element, coord, options, newScope());
    }
}
