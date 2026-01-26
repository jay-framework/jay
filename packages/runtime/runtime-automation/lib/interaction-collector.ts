import type { Interaction } from './types';

/**
 * Collects all interactive elements from a component's refs.
 * Handles nested refs (e.g., headless components) by recursively traversing the refs tree.
 */
export function collectInteractions(refs: any): Interaction[] {
    const interactions: Interaction[] = [];

    if (!refs) return interactions;

    collectInteractionsRecursive(refs, interactions);

    return interactions;
}

/**
 * Recursively collects interactions from refs, handling nested ref managers.
 */
function collectInteractionsRecursive(refs: any, interactions: Interaction[]): void {
    if (!refs) return;

    // Iterate through all refs in the component
    for (const [refName, refImpl] of Object.entries(refs as Record<string, any>)) {
        if (!refImpl) continue;

        // Check if it's a ref proxy (has 'elements' Set from PrivateRefs)
        // This handles both single refs and collection refs
        if (refImpl.elements && refImpl.elements instanceof Set) {
            // Iterate through all elements in the ref
            for (const elem of refImpl.elements) {
                if (elem.element) {
                    interactions.push({
                        refName,
                        coordinate: elem.coordinate || [refName],
                        element: elem.element,
                        elementType: getElementType(elem.element),
                        supportedEvents: getSupportedEvents(elem.element),
                        itemContext: elem.viewState,
                    });
                }
            }
        } else if (isNestedRefsObject(refImpl)) {
            // It's a nested refs object (e.g., headless component's refs)
            // Recurse into it
            collectInteractionsRecursive(refImpl, interactions);
        }
    }
}

/**
 * Check if an object is a nested refs object (plain object containing refs).
 * A nested refs object is a plain object that:
 * - Is not a ref proxy (doesn't have 'elements' Set)
 * - Contains values that look like refs or more nested objects
 */
function isNestedRefsObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // If it has 'elements' as a Set, it's a ref proxy, not a nested object
    if (obj.elements instanceof Set) return false;

    // Check if it's a plain object (not a DOM element, not a function, etc.)
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) return false;

    // It's a plain object - likely nested refs
    return true;
}

function getElementType(element: HTMLElement): string {
    return element.constructor.name; // e.g., "HTMLButtonElement"
}

function getSupportedEvents(element: HTMLElement): string[] {
    // Common events based on element type
    const base = ['click', 'focus', 'blur'];

    if (element instanceof HTMLInputElement) {
        return [...base, 'input', 'change'];
    }
    if (element instanceof HTMLButtonElement) {
        return ['click', 'focus', 'blur'];
    }
    if (element instanceof HTMLSelectElement) {
        return [...base, 'change'];
    }
    if (element instanceof HTMLTextAreaElement) {
        return [...base, 'input', 'change'];
    }
    if (element instanceof HTMLAnchorElement) {
        return ['click'];
    }
    if (element instanceof HTMLFormElement) {
        return ['submit', 'reset'];
    }

    return base;
}
