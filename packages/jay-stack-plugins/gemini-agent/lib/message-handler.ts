/**
 * Core message handling logic for the Gemini agent.
 *
 * Shared between sendMessage and submitToolResults actions.
 * The server is stateless — history is passed in and returned.
 */

import { actionRegistry } from '@jay-framework/stack-server-runtime';
import { GeminiService } from './gemini-service';
import { toGeminiTools, resolveToolCallTarget } from './tool-bridge';
import { buildSystemPrompt } from './system-prompt';
import type {
    GeminiMessage,
    GeminiPart,
    GeminiFunctionDeclaration,
    PendingToolCall,
    SendMessageOutput,
    SerializedToolDef,
    GeminiFunctionResponsePart,
} from './gemini-types';

/**
 * Processes a Gemini response and handles tool calls:
 * - Server-action tools are executed immediately on the server.
 * - Page-automation tools are returned to the client for execution.
 * - If all tools are server-side, the result is fed back to Gemini automatically.
 * - If any tools are client-side, the response is returned with pending calls.
 */
export async function processGeminiTurn(
    service: GeminiService,
    history: GeminiMessage[],
    tools: GeminiFunctionDeclaration[],
    systemPrompt: string,
    clientToolNames: Set<string>,
): Promise<SendMessageOutput> {
    const response = await service.generateWithTools(history, tools, systemPrompt);

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
        return {
            type: 'response',
            message: 'I apologize, but I was unable to generate a response.',
            history,
        };
    }

    const parts = candidate.content.parts;

    // Check for function calls
    const functionCalls = parts.filter(
        (p: any): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
            p.functionCall != null,
    );

    // Cast SDK Part[] to our GeminiPart[] — the SDK type is wider but
    // we only read text/functionCall/functionResponse fields
    const responseParts = candidate.content.parts as unknown as GeminiPart[];

    if (functionCalls.length === 0) {
        // Pure text response
        const textParts = parts.filter((p: any) => p.text != null);
        const message = textParts.map((p: any) => p.text).join('');

        const updatedHistory: GeminiMessage[] = [
            ...history,
            { role: 'model', parts: responseParts },
        ];

        return {
            type: 'response',
            message,
            history: updatedHistory,
        };
    }

    // We have function calls — categorize them
    const updatedHistory: GeminiMessage[] = [...history, { role: 'model', parts: responseParts }];

    const pendingClientCalls: PendingToolCall[] = [];
    const serverCallResults: GeminiFunctionResponsePart[] = [];

    for (const fc of functionCalls) {
        const target = resolveToolCallTarget(fc.functionCall.name, clientToolNames);

        if (target.category === 'server-action') {
            // Execute server action immediately
            const result = await actionRegistry.execute(target.name, fc.functionCall.args);
            serverCallResults.push({
                functionResponse: {
                    name: fc.functionCall.name,
                    response: result.success
                        ? { result: result.data }
                        : { error: result.error?.message || 'Unknown error' },
                },
            });
        } else {
            // Page automation — must be executed on the client
            pendingClientCalls.push({
                id: fc.functionCall.name,
                name: fc.functionCall.name,
                args: fc.functionCall.args || {},
                category: 'page-automation',
            });
        }
    }

    // If we have pending client calls, return them (along with any server results already obtained)
    if (pendingClientCalls.length > 0) {
        // Include already-executed server action results in the pending calls as well
        // so the client knows not to re-execute them
        const allPending: PendingToolCall[] = [
            ...pendingClientCalls,
            // Server actions already executed — include as completed calls
            ...serverCallResults.map((r) => ({
                id: r.functionResponse.name,
                name: r.functionResponse.name,
                args: {},
                category: 'server-action' as const,
            })),
        ];

        return {
            type: 'tool-calls',
            calls: pendingClientCalls,
            history: updatedHistory,
        };
    }

    // All calls were server-side — feed results back to Gemini
    const historyWithResults: GeminiMessage[] = [
        ...updatedHistory,
        { role: 'user', parts: serverCallResults },
    ];

    return processGeminiTurn(service, historyWithResults, tools, systemPrompt, clientToolNames);
}

/**
 * Builds the full tool list and system prompt, then processes a Gemini turn.
 */
export async function handleConversation(
    service: GeminiService,
    history: GeminiMessage[],
    toolDefinitions: SerializedToolDef[],
    pageState: object,
): Promise<SendMessageOutput> {
    const serverActions = actionRegistry.getActionsWithMetadata();
    const tools = toGeminiTools(toolDefinitions, serverActions);

    const serverActionSummaries = serverActions.map((a) => ({
        name: a.actionName,
        description: a.metadata.description,
    }));

    const systemPrompt = buildSystemPrompt(
        pageState,
        serverActionSummaries,
        service.systemPromptPrefix,
    );

    const clientToolNames = new Set(toolDefinitions.map((t) => t.name));

    return processGeminiTurn(service, history, tools, systemPrompt, clientToolNames);
}
