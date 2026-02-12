import type { Interaction, GroupedInteraction } from './types';

/**
 * Groups raw interactions by refName, collapsing forEach items into a single entry.
 *
 * @param rawInteractions - Flat list of interactions (one per coordinate)
 * @returns Grouped interactions (one per unique refName)
 */
export function groupInteractions(rawInteractions: Interaction[]): GroupedInteraction[] {
    const byRef = new Map<string, Interaction[]>();
    for (const i of rawInteractions) {
        let group = byRef.get(i.refName);
        if (!group) {
            group = [];
            byRef.set(i.refName, group);
        }
        group.push(i);
    }

    return Array.from(byRef.entries()).map(([refName, items]) => {
        const sample = items[0];
        const isForEach = items.length > 1 || sample.coordinate.length > 1;
        const result: GroupedInteraction = {
            ref: refName,
            type: friendlyType(sample.elementType),
            events: relevantEvents(sample),
            description: sample.description,
        };
        if (isForEach) {
            result.inForEach = true;
            result.items = items.map((i) => ({
                id: i.coordinate[0],
                label: guessLabel(i.itemContext),
            }));
        }
        return result;
    });
}

/**
 * Convert HTML element type to a friendly name.
 */
function friendlyType(elementType: string): string {
    switch (elementType) {
        case 'HTMLButtonElement':
            return 'Button';
        case 'HTMLInputElement':
            return 'TextInput';
        case 'HTMLTextAreaElement':
            return 'TextArea';
        case 'HTMLSelectElement':
            return 'Select';
        case 'HTMLAnchorElement':
            return 'Link';
        default:
            return elementType.replace('HTML', '').replace('Element', '') || 'Element';
    }
}

/**
 * Filter to relevant events for the element type.
 * Buttons: just ["click"]. Inputs: ["input", "change"]. Others: all supported.
 */
function relevantEvents(interaction: Interaction): string[] {
    const { elementType, supportedEvents } = interaction;
    if (elementType === 'HTMLButtonElement' || elementType === 'HTMLAnchorElement') {
        return ['click'];
    }
    if (
        elementType === 'HTMLInputElement' ||
        elementType === 'HTMLTextAreaElement' ||
        elementType === 'HTMLSelectElement'
    ) {
        return supportedEvents.filter((e) => e === 'input' || e === 'change');
    }
    return supportedEvents;
}

/**
 * Derive a human-readable label from an item's ViewState context.
 * Checks common field names, then falls back to first string value.
 */
function guessLabel(ctx?: object): string {
    if (!ctx) return '';
    const obj = ctx as Record<string, unknown>;
    for (const key of ['name', 'title', 'label', 'text']) {
        if (key in obj && typeof obj[key] === 'string') return obj[key] as string;
    }
    for (const val of Object.values(obj)) {
        if (typeof val === 'string') return val;
    }
    return '';
}
