/**
 * Core message handling logic for the Gemini agent.
 *
 * Shared between sendMessage and submitToolResults actions.
 * The server is stateless — history is passed in and returned.
 *
 * Tool discovery: slim declarations (name + description, empty params)
 * are sent so Gemini uses correct tool names. When the LLM calls a tool
 * without first calling get_tool_details, it gets an error response
 * telling it to discover first. After discovery, the full declaration
 * replaces the slim one for subsequent calls.
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

/** Names of meta-tools that are always available (not subject to discovery). */
const META_TOOL_NAMES = new Set(['get_tool_details', 'get_page_state']);

/**
 * Processes a Gemini response and handles tool calls:
 * - `get_page_state` calls return the full untruncated page state.
 * - `get_tool_details` calls return full schemas and upgrade the slim
 *   declarations to full ones so the LLM can call those tools next.
 * - Calls to undiscovered tools (still slim) are rejected with an error
 *   telling the LLM to call get_tool_details first.
 * - Server-action tools are executed immediately on the server.
 * - Page-automation tools are returned to the client for execution.
 */
export async function processGeminiTurn(
    service: GeminiService,
    history: GeminiMessage[],
    tools: GeminiFunctionDeclaration[],
    systemPrompt: string,
    clientToolNames: Set<string>,
    fullToolLookup: Map<string, GeminiFunctionDeclaration>,
    pageState: object,
    discoveredTools: Set<string>,
    turnNumber: number = 1,
): Promise<SendMessageOutput> {
    const log = getLogger();

    // Extract latest user message for logging
    const lastUserMsg = [...history]
        .reverse()
        .find((m) => m.role === 'user' && m.parts.some((p: any) => p.text));
    const userText = lastUserMsg
        ? (lastUserMsg.parts.find((p: any) => p.text) as any)?.text || ''
        : '';

    // Log pre-call metrics
    const historySize = approxSize(history);
    const toolNames = tools.map((t) => t.name);
    log.info(
        `[gemini-agent] Turn ${turnNumber} | user: "${userText}" | history: ${history.length} msgs (~${historySize} chars) | tools: ${toolNames.length} (${toolNames.join(', ')}) | prompt: ${systemPrompt.length} chars`,
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
            `[gemini-agent] Turn ${turnNumber} | response: text (~${responseSize} chars) | ${duration}ms\n${JSON.stringify(responseParts, null, 2)}`,
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
        `[gemini-agent] Turn ${turnNumber} | response: tool-calls (${callNames.join(', ')}) (~${responseSize} chars) | ${duration}ms\n${JSON.stringify(responseParts, null, 2)}`,
    );

    const updatedHistory: GeminiMessage[] = [...history, { role: 'model', parts: responseParts }];

    const pendingClientCalls: PendingToolCall[] = [];
    const serverCallResults: GeminiFunctionResponsePart[] = [];

    // Track tools to upgrade from slim to full after get_tool_details
    let expandedTools = tools;

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

        // Handle get_tool_details — return full schemas and upgrade declarations
        if (name === 'get_tool_details') {
            const requestedNames = (fc.functionCall.args?.tool_names as string[]) || [];
            const schemas: Record<string, unknown> = {};
            const newFullDeclarations: GeminiFunctionDeclaration[] = [];

            for (const toolName of requestedNames) {
                const full = fullToolLookup.get(toolName);
                if (full) {
                    schemas[toolName] = full.parameters;
                    discoveredTools.add(toolName);
                    // Replace slim declaration with full one
                    if (!newFullDeclarations.some((d) => d.name === toolName)) {
                        newFullDeclarations.push(full);
                    }
                }
            }

            if (newFullDeclarations.length > 0) {
                // Replace slim declarations with full ones
                const upgradeNames = new Set(newFullDeclarations.map((d) => d.name));
                expandedTools = [
                    ...expandedTools.filter((t) => !upgradeNames.has(t.name)),
                    ...newFullDeclarations,
                ];
            }

            serverCallResults.push({
                functionResponse: {
                    name: 'get_tool_details',
                    response: schemas,
                },
            });
            continue;
        }

        // Auto-discover tools that haven't been discovered yet:
        // return their full schema so the LLM can retry with correct params
        if (!META_TOOL_NAMES.has(name) && !discoveredTools.has(name)) {
            const full = fullToolLookup.get(name);
            if (full) {
                discoveredTools.add(name);
                const upgradeNames = new Set([name]);
                expandedTools = [...expandedTools.filter((t) => !upgradeNames.has(t.name)), full];
                serverCallResults.push({
                    functionResponse: {
                        name,
                        response: {
                            error: `This tool requires parameters. Here is the schema: ${JSON.stringify(full.parameters)}. Call ${name} again with the correct parameters.`,
                        },
                    },
                });
            } else {
                serverCallResults.push({
                    functionResponse: {
                        name,
                        response: { error: `Unknown tool '${name}'.` },
                    },
                });
            }
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
        expandedTools,
        systemPrompt,
        clientToolNames,
        fullToolLookup,
        pageState,
        discoveredTools,
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

    // Full declarations — used for the lookup map only (not sent to Gemini)
    const fullTools = toGeminiTools(toolDefinitions, serverActions);
    const fullToolLookup = new Map<string, GeminiFunctionDeclaration>();
    for (const tool of fullTools) {
        fullToolLookup.set(tool.name, tool);
    }

    // Slim declarations + meta-tools — sent to Gemini.
    // Slim declarations ensure correct tool names; the LLM must call
    // get_tool_details before using any tool.
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
        new Set<string>(),
    );
}
