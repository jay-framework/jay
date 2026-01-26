import type { AIInteraction } from './types';

/**
 * Collects all interactive elements from a component's refs.
 */
export function collectInteractions(refs: any): AIInteraction[] {
    const interactions: AIInteraction[] = [];

    if (!refs) return interactions;

    // Iterate through all refs in the component
    for (const [refName, refImpl] of Object.entries(refs as Record<string, any>)) {
        if (!refImpl) continue;

        // Check if it's a collection ref (has 'elements' Set from PrivateRefs)
        if (refImpl.elements && refImpl.elements instanceof Set) {
            // Collection ref (forEach)
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
        } else if (refImpl.element) {
            // Single ref (HTMLElementRefsImpl or similar)
            const elemSet = refImpl.elements;
            if (elemSet && elemSet instanceof Set) {
                for (const elem of elemSet) {
                    interactions.push({
                        refName,
                        coordinate: elem.coordinate || [refName],
                        element: elem.element,
                        elementType: getElementType(elem.element),
                        supportedEvents: getSupportedEvents(elem.element),
                    });
                }
            }
        }
    }

    return interactions;
}

function getElementType(element: Element): string {
    return element.constructor.name; // e.g., "HTMLButtonElement"
}

function getSupportedEvents(element: Element): string[] {
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
