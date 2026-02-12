import type { AutomationAPI } from '@jay-framework/runtime-automation';
import type { ToolDescriptor } from './webmcp-types';
import { parseCoordinate, jsonResult, errorResult } from './util';

/**
 * get-page-state: Returns the current ViewState (all data displayed on the page).
 */
export function makeGetPageStateTool(automation: AutomationAPI): ToolDescriptor {
    return {
        name: 'get-page-state',
        description: 'Get current page state including all data displayed on the page',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            const { viewState } = automation.getPageState();
            return jsonResult('Current page state:', viewState);
        },
    };
}

/**
 * list-interactions: Returns available interactions grouped by ref name.
 */
export function makeListInteractionsTool(automation: AutomationAPI): ToolDescriptor {
    return {
        name: 'list-interactions',
        description:
            'List all available UI interactions (buttons, inputs, selects) grouped by ref name. ' +
            'Use this to discover what actions are possible on the page.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
        execute: () => {
            const { interactions } = automation.getPageState();
            return jsonResult('Available interactions:', interactions);
        },
    };
}

/**
 * trigger-interaction: Trigger any event on any element by coordinate.
 * Coordinate is a "/"-separated string, e.g. "item-1/removeBtn" or "addBtn".
 */
export function makeTriggerInteractionTool(automation: AutomationAPI): ToolDescriptor {
    return {
        name: 'trigger-interaction',
        description:
            'Trigger an event on a UI element by coordinate. ' +
            'Coordinate format: "refName" for simple elements, "itemId/refName" for forEach items. ' +
            'Default event is "click".',
        inputSchema: {
            type: 'object',
            properties: {
                coordinate: {
                    type: 'string',
                    description:
                        'Element coordinate path (e.g. "addBtn" or "item-1/removeBtn")',
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
    };
}

/**
 * fill-input: Set a value on an input/textarea/select element and trigger the appropriate event.
 */
export function makeFillInputTool(automation: AutomationAPI): ToolDescriptor {
    return {
        name: 'fill-input',
        description:
            'Set a value on an input, textarea, or select element and trigger an update. ' +
            'Coordinate format: "refName" for simple elements, "itemId/refName" for forEach items.',
        inputSchema: {
            type: 'object',
            properties: {
                coordinate: {
                    type: 'string',
                    description:
                        'Element coordinate path (e.g. "nameInput" or "item-1/quantityInput")',
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
                const interaction = automation.getInteraction(coord);
                if (!interaction) {
                    return errorResult(`No element found at coordinate: ${coord.join('/')}`);
                }

                const el = interaction.element as HTMLInputElement;
                el.value = value;

                // Trigger the appropriate event
                const isSelect = interaction.elementType === 'HTMLSelectElement';
                const eventType = isSelect ? 'change' : 'input';
                automation.triggerEvent(eventType, coord);

                return jsonResult(`Set value "${value}" on ${params.coordinate}`, automation.getPageState().viewState);
            } catch (e) {
                return errorResult((e as Error).message);
            }
        },
    };
}
