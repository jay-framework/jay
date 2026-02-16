/**
 * Shared type definitions for the Gemini agent plugin.
 */

// ============================================================================
// Gemini API Types (subset used by the plugin)
// ============================================================================

export interface GeminiMessage {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

export type GeminiPart = GeminiTextPart | GeminiFunctionCallPart | GeminiFunctionResponsePart;

export interface GeminiTextPart {
    text: string;
}

export interface GeminiFunctionCallPart {
    functionCall: {
        name: string;
        args: Record<string, unknown>;
    };
}

export interface GeminiFunctionResponsePart {
    functionResponse: {
        name: string;
        response: Record<string, unknown>;
    };
}

// ============================================================================
// Tool Definitions (serialized from client to server)
// ============================================================================

export interface SerializedToolDef {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    category: 'page-automation';
}

// ============================================================================
// Action Interfaces
// ============================================================================

export interface SendMessageInput {
    /** User's message text */
    message: string;
    /** Full conversation history (Gemini format) */
    history: GeminiMessage[];
    /** Page automation tool definitions (serialized from client) */
    toolDefinitions: SerializedToolDef[];
    /** Current page state snapshot */
    pageState: object;
}

export interface PendingToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
    category: 'page-automation' | 'server-action';
}

export type SendMessageOutput =
    | { type: 'response'; message: string; history: GeminiMessage[] }
    | { type: 'tool-calls'; calls: PendingToolCall[]; history: GeminiMessage[] };

export interface SubmitToolResultsInput {
    /** Tool execution results */
    results: ToolCallResult[];
    /** Full conversation history (including the tool call turn) */
    history: GeminiMessage[];
    /** Resend tool definitions (page state may have changed) */
    toolDefinitions: SerializedToolDef[];
    /** Fresh page state (may have changed after tool execution) */
    pageState: object;
}

export interface ToolCallResult {
    callId: string;
    /** JSON-stringified result */
    result: string;
    isError?: boolean;
}

export type SubmitToolResultsOutput = SendMessageOutput;

// ============================================================================
// Gemini Service
// ============================================================================

export interface GeminiFunctionDeclaration {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface GeminiServiceConfig {
    apiKey: string;
    model: string;
    systemPrompt?: string;
}
