/**
 * Annotates jay-html elements with stable `data-jay-node-id` attributes.
 *
 * IDs are position-based (e.g. "j-0-1-3") derived from the element's index path
 * in the source template. Existing IDs are preserved — only missing ones are added.
 *
 * This enables reliable matching between:
 * - The source jay-html (parsed by node-html-parser)
 * - The rendered page (served by dev server, extracted by Playwright)
 * - The vendor document (FigmaVendorDocument or other formats)
 */

import { HTMLElement, NodeType } from 'node-html-parser';

const ATTR = 'data-jay-node-id';

/**
 * Walk a parsed jay-html body and ensure every element has `data-jay-node-id`.
 * Existing IDs are preserved. Missing IDs are generated from position.
 *
 * @returns true if any IDs were added (caller should write back to disk)
 */
export function annotateJayNodeIds(body: HTMLElement): boolean {
    let changed = false;

    function walk(el: HTMLElement, path: number[]) {
        if (!el.getAttribute(ATTR)) {
            el.setAttribute(ATTR, `j-${path.join('-')}`);
            changed = true;
        }

        let childIndex = 0;
        for (const child of el.childNodes) {
            if (child.nodeType === NodeType.ELEMENT_NODE) {
                walk(child as HTMLElement, [...path, childIndex]);
                childIndex++;
            }
        }
    }

    // Start from body's children (body itself is the root, not annotated)
    let childIndex = 0;
    for (const child of body.childNodes) {
        if (child.nodeType === NodeType.ELEMENT_NODE) {
            walk(child as HTMLElement, [childIndex]);
            childIndex++;
        }
    }

    return changed;
}

/**
 * Read `data-jay-node-id` from an element if present.
 */
export function getJayNodeId(el: HTMLElement): string | undefined {
    return el.getAttribute(ATTR) || undefined;
}

export const JAY_NODE_ID_ATTR = ATTR;
