/**
 * Tool Bridge — converts jay-stack tool descriptors and action metadata
 * to Gemini FunctionDeclarations.
 *
 * Supports two modes:
 * - Full declarations (toGeminiTools) — used for the fullToolLookup map
 * - Slim declarations (toSlimGeminiTools) — sent to Gemini with empty
 *   parameters to reduce token usage. The LLM calls `get_tool_details`
 *   to retrieve full schemas on demand.
 */

import type { ActionMetadata } from '@jay-framework/stack-server-runtime';
import type { SerializedToolDef, GeminiFunctionDeclaration } from '../types';

/**
 * The `get_page_state` meta-tool declaration.
 * Returns the full untruncated page state on demand. The system prompt
 * includes a compact (truncated) version; this tool provides the full data
 * when the LLM needs it (e.g., listing all products).
 */
export const PAGE_STATE_TOOL: GeminiFunctionDeclaration = {
    name: 'get_page_state',
    description:
        'Get the full current page state. Use when the compact state in context is insufficient (e.g., to see all items in a truncated list).',
    parameters: {
        type: 'object',
        properties: {},
    },
};

/**
 * The `get_tool_details` meta-tool declaration.
 * Added to every Gemini call so the LLM can discover full parameter
 * schemas on demand instead of receiving them all upfront.
 */
export const DISCOVERY_TOOL: GeminiFunctionDeclaration = {
    name: 'get_tool_details',
    description:
        'Get full parameter schemas for tools. Call before using tools that need coordinates or specific values.',
    parameters: {
        type: 'object',
        properties: {
            tool_names: {
                type: 'array',
                items: { type: 'string' },
                description: 'Names of tools to get details for',
            },
        },
        required: ['tool_names'],
    },
};

/**
 * Converts page automation tools and server actions into full Gemini
 * function declarations (with complete parameter schemas).
 */
export function toGeminiTools(
    clientTools: SerializedToolDef[],
    serverActions: Array<{ actionName: string; metadata: ActionMetadata }>,
): GeminiFunctionDeclaration[] {
    const tools: GeminiFunctionDeclaration[] = [];

    for (const tool of clientTools) {
        tools.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        });
    }

    for (const { actionName, metadata } of serverActions) {
        tools.push({
            name: `action_${actionName.replace(/\./g, '_')}`,
            description: metadata.description,
            parameters: metadata.inputSchema,
        });
    }

    return tools;
}

/**
 * Converts page automation tools and server actions into slim Gemini
 * function declarations — name + description only, empty parameters.
 * The LLM uses `get_tool_details` to fetch full schemas on demand.
 */
export function toSlimGeminiTools(
    clientTools: SerializedToolDef[],
    serverActions: Array<{ actionName: string; metadata: ActionMetadata }>,
): GeminiFunctionDeclaration[] {
    const tools: GeminiFunctionDeclaration[] = [];

    for (const tool of clientTools) {
        tools.push({
            name: tool.name,
            description: tool.description,
            parameters: { type: 'object', properties: {} },
        });
    }

    for (const { actionName, metadata } of serverActions) {
        tools.push({
            name: `action_${actionName.replace(/\./g, '_')}`,
            description: metadata.description,
            parameters: { type: 'object', properties: {} },
        });
    }

    return tools;
}

/**
 * Builds a compact text summary of all available tools for the system prompt.
 * Lists tool names and descriptions, with param names where applicable.
 */
export function buildToolSummary(
    clientTools: SerializedToolDef[],
    serverActions: Array<{ actionName: string; metadata: ActionMetadata }>,
): string {
    const lines: string[] = [];

    for (const tool of clientTools) {
        const paramNames = Object.keys(tool.inputSchema.properties || {});
        const paramSuffix = paramNames.length > 0 ? ` (params: ${paramNames.join(', ')})` : '';
        lines.push(`- ${tool.name}: ${tool.description}${paramSuffix}`);
    }

    for (const { actionName, metadata } of serverActions) {
        const toolName = `action_${actionName.replace(/\./g, '_')}`;
        const paramNames = Object.keys(metadata.inputSchema?.properties || {});
        const paramSuffix = paramNames.length > 0 ? ` (params: ${paramNames.join(', ')})` : '';
        lines.push(`- ${toolName}: ${metadata.description}${paramSuffix}`);
    }

    return lines.join('\n');
}

/**
 * Maps a Gemini function call name back to its original action name.
 * Reverses the `action_` prefix and `_` → `.` replacement.
 */
export function resolveToolCallTarget(
    toolName: string,
    clientToolNames: Set<string>,
): { category: 'page-automation'; name: string } | { category: 'server-action'; name: string } {
    if (clientToolNames.has(toolName)) {
        return { category: 'page-automation', name: toolName };
    }

    if (toolName.startsWith('action_')) {
        const actionName = toolName.slice('action_'.length).replace(/_/g, '.');
        return { category: 'server-action', name: actionName };
    }

    // Unknown tool — treat as page automation (fallback)
    return { category: 'page-automation', name: toolName };
}
