/**
 * Core message handling logic for the Gemini agent.
 *
 * Shared between sendMessage and submitToolResults actions.
 * The server is stateless — history is passed in and returned.
 */

import { actionRegistry } from '@jay-framework/stack-server-runtime';
import { getLogger } from '@jay-framework/logger';
import { GeminiService } from './service';
import {
    toGeminiTools,
    toSlimGeminiTools,
    buildToolSummary,
    resolveToolCallTarget,
    DISCOVERY_TOOL,
    PAGE_STATE_TOOL,
} from './tool-bridge';
import { buildSystemPrompt } from './system-prompt';
import type {
    GeminiMessage,
    GeminiPart,
    GeminiFunctionDeclaration,
    PendingToolCall,
    SendMessageOutput,
    SerializedToolDef,
    GeminiFunctionResponsePart,
} from '../types';

/**
 * Approximate byte size of a value via JSON serialization.
 */
function approxSize(value: unknown): number {
    return JSON.stringify(value).length;
}

/**
 * Processes a Gemini response and handles tool calls:
 * - `get_page_state` calls return the full untruncated page state.
 * - `get_tool_details` calls are resolved from the fullToolLookup and fed back.
 * - Server-action tools are executed immediately on the server.
 * - Page-automation tools are returned to the client for execution.
 * - If all tools are server-side / discovery, the result is fed back to Gemini automatically.
 * - If any tools are client-side, the response is returned with pending calls.
 */
export async function processGeminiTurn(
    service: GeminiService,
    history: GeminiMessage[],
    tools: GeminiFunctionDeclaration[],
    systemPrompt: string,
    clientToolNames: Set<string>,
    fullToolLookup: Map<string, GeminiFunctionDeclaration>,
    pageState: object,
    turnNumber: number = 1,
): Promise<SendMessageOutput> {
    const log = getLogger();

    // Log pre-call metrics
    const historySize = approxSize(history);
    const toolNames = tools.map((t) => t.name);
    log.info(
        `[gemini-agent] Turn ${turnNumber} | history: ${history.length} msgs (~${historySize} chars) | tools: ${toolNames.length} (${toolNames.join(', ')}) | prompt: ${systemPrompt.length} chars`,
    );

    const startTime = Date.now();
    const response = await service.generateWithTools(history, tools, systemPrompt);
    const duration = Date.now() - startTime;

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
        log.info(`[gemini-agent] Turn ${turnNumber} | response: empty | ${duration}ms`);
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
    const responseSize = approxSize(responseParts);

    if (functionCalls.length === 0) {
        // Pure text response
        const textParts = parts.filter((p: any) => p.text != null);
        const message = textParts.map((p: any) => p.text).join('');

        log.info(
            `[gemini-agent] Turn ${turnNumber} | response: text (~${responseSize} chars) | ${duration}ms`,
        );

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
    const callNames = functionCalls.map((fc) => fc.functionCall.name);
    log.info(
        `[gemini-agent] Turn ${turnNumber} | response: tool-calls (${callNames.join(', ')}) (~${responseSize} chars) | ${duration}ms`,
    );

    const updatedHistory: GeminiMessage[] = [...history, { role: 'model', parts: responseParts }];

    const pendingClientCalls: PendingToolCall[] = [];
    const serverCallResults: GeminiFunctionResponsePart[] = [];

    for (const fc of functionCalls) {
        const name = fc.functionCall.name;

        // Handle get_page_state — return full untruncated page state
        if (name === 'get_page_state') {
            serverCallResults.push({
                functionResponse: {
                    name: 'get_page_state',
                    response: pageState as Record<string, unknown>,
                },
            });
            continue;
        }

        // Handle get_tool_details — return full schemas from the lookup
        if (name === 'get_tool_details') {
            const requestedNames = (fc.functionCall.args?.tool_names as string[]) || [];
            const schemas: Record<string, unknown> = {};
            for (const toolName of requestedNames) {
                const full = fullToolLookup.get(toolName);
                if (full) {
                    schemas[toolName] = full.parameters;
                }
            }
            serverCallResults.push({
                functionResponse: {
                    name: 'get_tool_details',
                    response: schemas,
                },
            });
            continue;
        }

        const target = resolveToolCallTarget(name, clientToolNames);

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

    // If we have pending client calls, return them
    if (pendingClientCalls.length > 0) {
        return {
            type: 'tool-calls',
            calls: pendingClientCalls,
            history: updatedHistory,
        };
    }

    // All calls were server-side or discovery — feed results back to Gemini
    const historyWithResults: GeminiMessage[] = [
        ...updatedHistory,
        { role: 'user', parts: serverCallResults },
    ];

    return processGeminiTurn(
        service,
        historyWithResults,
        tools,
        systemPrompt,
        clientToolNames,
        fullToolLookup,
        pageState,
        turnNumber + 1,
    );
}

/**
 * Builds the slim tool list, full lookup, tool summary, and system prompt,
 * then processes a Gemini turn.
 */
export async function handleConversation(
    service: GeminiService,
    history: GeminiMessage[],
    toolDefinitions: SerializedToolDef[],
    pageState: object,
): Promise<SendMessageOutput> {
    // Exclude the gemini agent's own actions — they should never be
    // exposed as tools (calling sendMessage/submitToolResults from the
    // LLM would be recursive and nonsensical).
    const serverActions = actionRegistry
        .getActionsWithMetadata()
        .filter((a) => !a.actionName.startsWith('geminiAgent.'));

    // Full declarations — used for the lookup map only
    const fullTools = toGeminiTools(toolDefinitions, serverActions);
    const fullToolLookup = new Map<string, GeminiFunctionDeclaration>();
    for (const tool of fullTools) {
        fullToolLookup.set(tool.name, tool);
    }

    // Slim declarations + meta-tools — sent to Gemini
    const slimTools = toSlimGeminiTools(toolDefinitions, serverActions);
    const toolsForGemini = [...slimTools, DISCOVERY_TOOL, PAGE_STATE_TOOL];

    // Tool summary for system prompt
    const toolSummary = buildToolSummary(toolDefinitions, serverActions);

    const systemPrompt = buildSystemPrompt(pageState, toolSummary, service.systemPromptPrefix);

    const clientToolNames = new Set(toolDefinitions.map((t) => t.name));

    return processGeminiTurn(
        service,
        history,
        toolsForGemini,
        systemPrompt,
        clientToolNames,
        fullToolLookup,
        pageState,
    );
}
