/**
 * Tool Bridge — converts jay-stack tool descriptors and action metadata
 * to Gemini FunctionDeclarations.
 *
 * Only actions with .jay-action metadata are exposed to the AI agent.
 * Page automation tools (from AutomationAPI) are always included.
 */

import type { ActionMetadata } from '@jay-framework/stack-server-runtime';
import type { SerializedToolDef, GeminiFunctionDeclaration } from './gemini-types';

/**
 * Converts page automation tools and server actions into Gemini function declarations.
 *
 * - Client tools are included directly (already have schema).
 * - Server actions are only included if they have .jay-action metadata.
 *   Actions without metadata are silently skipped (opt-in mechanism).
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
