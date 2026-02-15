import type { AutomationAPI, Interaction } from '@jay-framework/runtime-automation';
import type { ToolDescriptor } from './webmcp-types';
import { toKebab, toHumanReadable, jsonResult, errorResult, getSelectOptions, withLogging } from './util';

const FILLABLE_TYPES = new Set([
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
]);

/**
 * Build semantic tools derived from the current page interactions.
 * One tool per Interaction group (i.e., per unique refName).
 *
 * @returns Array of tool descriptors
 */
export function buildSemanticTools(automation: AutomationAPI): ToolDescriptor[] {
    const { interactions } = automation.getPageState();
    const tools: ToolDescriptor[] = [];

    for (const group of interactions) {
        const tool = makeSemanticTool(group, automation);
        if (tool) {
            tools.push(tool);
        }
    }

    return tools;
}

/**
 * Build a semantic tool for an Interaction group.
 */
function makeSemanticTool(
    group: Interaction,
    automation: AutomationAPI,
): ToolDescriptor | null {
    const sample = group.items[0];
    if (!sample) return null;

    const elementType = sample.element.constructor.name;
    const isFillable = FILLABLE_TYPES.has(elementType);
    const isSelect = elementType === 'HTMLSelectElement';
    const isForEach = group.items.length > 1 || sample.coordinate.length > 1;

    const prefix = isFillable ? 'fill' : 'click';
    const toolName = `${prefix}-${toKebab(group.refName)}`;

    const description =
        group.description ||
        `${isFillable ? 'Fill' : 'Click'} ${toHumanReadable(group.refName)}${isForEach ? ' for a specific item' : ''}`;

    const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
    const required: string[] = [];

    if (isForEach) {
        const coordStrings = group.items.map((i) => i.coordinate.join('/'));
        properties.coordinate = {
            type: 'string',
            description: 'Item coordinate',
            enum: coordStrings,
        };
        required.push('coordinate');
    }

    if (isFillable) {
        const selectOptions = isSelect ? getSelectOptions(sample.element) : undefined;
        properties.value = {
            type: 'string',
            description: isSelect ? 'Value to select' : 'Value to set',
            ...(selectOptions ? { enum: selectOptions } : {}),
        };
        required.push('value');
    }

    return withLogging({
        name: toolName,
        description,
        inputSchema: { type: 'object', properties, required },
        execute: (params) => {
            const coord = isForEach
                ? (params.coordinate as string).split('/')
                : [group.refName];

            try {
                if (isFillable) {
                    const instance = automation.getInteraction(coord);
                    if (!instance) return errorResult(`Element not found: ${coord.join('/')}`);
                    (instance.element as HTMLInputElement).value = params.value as string;
                    automation.triggerEvent(isSelect ? 'change' : 'input', coord);
                } else {
                    automation.triggerEvent('click', coord);
                }

                return jsonResult('Done', automation.getPageState().viewState);
            } catch (e) {
                return errorResult((e as Error).message);
            }
        },
    });
}
