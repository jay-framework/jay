import type { CollectedInteraction, Interaction, InteractionInstance } from './types';

/**
 * Groups raw collected interactions by refName and filters events to relevant ones.
 */
export function groupInteractions(raw: CollectedInteraction[]): Interaction[] {
    const byRef = new Map<string, CollectedInteraction[]>();
    for (const item of raw) {
        let group = byRef.get(item.refName);
        if (!group) {
            group = [];
            byRef.set(item.refName, group);
        }
        group.push(item);
    }

    return Array.from(byRef.entries()).map(([refName, items]) => ({
        refName,
        description: items[0].description,
        items: items.map(toInstance),
    }));
}

function toInstance(raw: CollectedInteraction): InteractionInstance {
    return {
        coordinate: raw.coordinate,
        element: raw.element,
        events: relevantEvents(raw),
    };
}

/**
 * Filter to relevant events for the element type.
 * Buttons/links: just ["click"]. Inputs: ["input", "change"]. Others: all supported.
 */
function relevantEvents(raw: CollectedInteraction): string[] {
    const el = raw.element;
    if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) {
        return ['click'];
    }
    if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
    ) {
        return raw.supportedEvents.filter((e) => e === 'input' || e === 'change');
    }
    return raw.supportedEvents;
}
