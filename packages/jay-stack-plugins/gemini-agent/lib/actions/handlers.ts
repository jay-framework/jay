/**
 * Server actions for the Gemini agent plugin.
 *
 * Both actions are stateless — the client sends the full conversation history.
 */

import { makeJayAction } from '@jay-framework/fullstack-component';
import { getService } from '@jay-framework/stack-server-runtime';
import { GEMINI_SERVICE } from '../init';
import { handleConversation } from '../agent/message-handler';
import type {
    SendMessageInput,
    SendMessageOutput,
    SubmitToolResultsInput,
    SubmitToolResultsOutput,
    GeminiMessage,
    GeminiFunctionResponsePart,
} from '../types';

/**
 * Main entry point for chat messages.
 *
 * Receives the user message, full conversation history, tool definitions,
 * and page state. Returns either a text response or pending tool calls.
 */
export const sendMessage = makeJayAction('geminiAgent.sendMessage')
    .withServices(GEMINI_SERVICE)
    .withHandler(async (input: SendMessageInput, service) => {
        const { message, history, toolDefinitions, pageState } = input;

        // Add user message to history
        const updatedHistory: GeminiMessage[] = [
            ...history,
            { role: 'user', parts: [{ text: message }] },
        ];

        return handleConversation(service, updatedHistory, toolDefinitions, pageState);
    });

/**
 * Continue after client executes page automation tools.
 *
 * Receives tool execution results, the updated history, and fresh page state.
 * Returns either a text response or more pending tool calls.
 */
export const submitToolResults = makeJayAction('geminiAgent.submitToolResults')
    .withServices(GEMINI_SERVICE)
    .withHandler(async (input: SubmitToolResultsInput, service) => {
        const { results, history, toolDefinitions, pageState } = input;

        // Convert tool results to Gemini function response parts
        const functionResponses: GeminiFunctionResponsePart[] = results.map((r) => ({
            functionResponse: {
                name: r.callId,
                response: r.isError ? { error: r.result } : JSON.parse(r.result),
            },
        }));

        // Add function responses to history
        const updatedHistory: GeminiMessage[] = [
            ...history,
            { role: 'user', parts: functionResponses },
        ];

        return handleConversation(service, updatedHistory, toolDefinitions, pageState);
    });
