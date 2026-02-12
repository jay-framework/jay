import type { AutomationAPI, GroupedInteraction } from '@jay-framework/runtime-automation';
import type { ModelContextContainer, Registration, ToolDescriptor } from './webmcp-types';
import { toKebab, toHumanReadable, jsonResult, errorResult } from './util';

/**
 * Register semantic tools derived from the current page interactions.
 * One tool per unique refName — forEach items become enum values on itemId param.
 *
 * @returns Array of registrations (to unregister when interactions change)
 */
export function registerSemanticTools(
    mc: ModelContextContainer,
    automation: AutomationAPI,
): Registration[] {
    const { interactions } = automation.getPageState();
    const registrations: Registration[] = [];

    for (const group of interactions) {
        const tool = makeSemanticTool(group, automation);
        if (tool) {
            registrations.push(mc.registerTool(tool));
        }
    }

    return registrations;
}

/**
 * Build a semantic tool for a single GroupedInteraction.
 */
function makeSemanticTool(
    group: GroupedInteraction,
    automation: AutomationAPI,
): ToolDescriptor | null {
    const isInput =
        group.type === 'TextInput' || group.type === 'TextArea' || group.type === 'NumberInput';
    const isSelect = group.type === 'Select';
    const isFillable = isInput || isSelect;

    const prefix = isFillable ? 'fill' : 'click';
    const toolName = `${prefix}-${toKebab(group.ref)}`;

    const description =
        group.description ||
        `${isFillable ? 'Fill' : 'Click'} ${toHumanReadable(group.ref)}${group.inForEach ? ' for a specific item' : ''}`;

    const properties: Record<string, { type: string; description?: string; enum?: string[] }> = {};
    const required: string[] = [];

    if (group.inForEach && group.items) {
        properties.itemId = {
            type: 'string',
            description: `Item identifier. Available: ${group.items.map((i) => `${i.id} (${i.label})`).join(', ')}`,
            enum: group.items.map((i) => i.id),
        };
        required.push('itemId');
    }

    if (isFillable) {
        properties.value = { type: 'string', description: 'Value to set' };
        required.push('value');
    }

    return {
        name: toolName,
        description,
        inputSchema: { type: 'object', properties, required },
        execute: (params) => {
            const coord = group.inForEach
                ? [params.itemId as string, group.ref]
                : [group.ref];

            try {
                if (isFillable) {
                    const interaction = automation.getInteraction(coord);
                    if (!interaction) {
                        return errorResult(`Element not found: ${coord.join('/')}`);
                    }
                    (interaction.element as HTMLInputElement).value = params.value as string;
                    automation.triggerEvent(isSelect ? 'change' : 'input', coord);
                } else {
                    automation.triggerEvent('click', coord);
                }

                return jsonResult('Done', automation.getPageState().viewState);
            } catch (e) {
                return errorResult((e as Error).message);
            }
        },
    };
}
