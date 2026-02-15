import type { AutomationAPI, Interaction } from '@jay-framework/runtime-automation';
import type { ToolDescriptor } from './webmcp-types';
import { parseCoordinate, jsonResult, errorResult, getSelectOptions, withLogging } from './util';

/**
 * Serialize Interaction[] to a WebMCP-friendly shape:
 *   element → elementType (string), coordinate[] → coordinate (string)
 *   For <select> elements, includes available option values.
 */
function serializeInteractions(interactions: Interaction[]) {
    return interactions.map((group) => ({
        refName: group.refName,
        ...(group.description ? { description: group.description } : {}),
        items: group.items.map((i) => {
            const options = getSelectOptions(i.element);
            return {
                coordinate: i.coordinate.join('/'),
                elementType: i.element.constructor.name,
                events: i.events,
                ...(options ? { options } : {}),
            };
        }),
    }));
}

/**
 * get-page-state: Returns the current ViewState with guidance on coordinates.
 */
export function makeGetPageStateTool(automation: AutomationAPI): ToolDescriptor {
    return withLogging({
        name: 'get-page-state',
        description:
            'Get current page state (ViewState) — all data displayed on the page as JSON. ' +
            'Arrays in the ViewState correspond to forEach lists in the UI. ' +
            'Each array item has an ID field (the trackBy key) that appears as the first segment of interaction coordinates. ' +
            'For example, if ViewState has items: [{id: "item-1", name: "Mouse"}], ' +
            'then "item-1/removeBtn" targets that item\'s remove button.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            const { viewState } = automation.getPageState();
            return jsonResult('Current page state:', viewState);
        },
    });
}

/**
 * list-interactions: Returns available interactions grouped by ref, serialized.
 */
export function makeListInteractionsTool(automation: AutomationAPI): ToolDescriptor {
    return withLogging({
        name: 'list-interactions',
        description:
            'List all interactive elements on the page, grouped by ref name. ' +
            'Each group has items with coordinate strings that identify specific elements. ' +
            'Single-segment coordinates (e.g. "addBtn") are standalone elements. ' +
            'Multi-segment coordinates (e.g. "item-1/removeBtn") are elements inside a list — ' +
            'the first segments identify the list item, the last segment is the element name.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            const { interactions } = automation.getPageState();
            return jsonResult('Available interactions:', serializeInteractions(interactions));
        },
    });
}

/**
 * trigger-interaction: Trigger any event on any element by coordinate string.
 */
export function makeTriggerInteractionTool(automation: AutomationAPI): ToolDescriptor {
    return withLogging({
        name: 'trigger-interaction',
        description:
            'Trigger an event on a UI element by its coordinate string. ' +
            'Use list-interactions to discover available coordinates. ' +
            'Default event is "click".',
        inputSchema: {
            type: 'object',
            properties: {
                coordinate: {
                    type: 'string',
                    description:
                        'Element coordinate (e.g. "addBtn" or "item-1/removeBtn")',
                },
                event: {
                    type: 'string',
                    description: 'Event type to trigger (default: "click")',
                },
            },
            required: ['coordinate'],
        },
        execute: (params) => {
            const coord = parseCoordinate(params.coordinate as string);
            const event = (params.event as string) || 'click';

            try {
                automation.triggerEvent(event, coord);
                return jsonResult(`Triggered "${event}" on ${params.coordinate}`, automation.getPageState().viewState);
            } catch (e) {
                return errorResult((e as Error).message);
            }
        },
    });
}

/**
 * fill-input: Set a value on an input/textarea/select element and trigger the appropriate event.
 */
export function makeFillInputTool(automation: AutomationAPI): ToolDescriptor {
    return withLogging({
        name: 'fill-input',
        description:
            'Set a value on an input, textarea, or select element and trigger an update event. ' +
            'Use list-interactions to find input coordinates.',
        inputSchema: {
            type: 'object',
            properties: {
                coordinate: {
                    type: 'string',
                    description:
                        'Element coordinate (e.g. "nameInput" or "item-1/quantityInput")',
                },
                value: {
                    type: 'string',
                    description: 'The value to set on the element',
                },
            },
            required: ['coordinate', 'value'],
        },
        execute: (params) => {
            const coord = parseCoordinate(params.coordinate as string);
            const value = params.value as string;

            try {
                const instance = automation.getInteraction(coord);
                if (!instance) {
                    return errorResult(`No element found at coordinate: ${coord.join('/')}`);
                }

                const el = instance.element as HTMLInputElement;
                el.value = value;

                // Trigger the appropriate event
                const isSelect = instance.element instanceof HTMLSelectElement;
                const eventType = isSelect ? 'change' : 'input';
                automation.triggerEvent(eventType, coord);

                return jsonResult(`Set value "${value}" on ${params.coordinate}`, automation.getPageState().viewState);
            } catch (e) {
                return errorResult((e as Error).message);
            }
        },
    });
}
