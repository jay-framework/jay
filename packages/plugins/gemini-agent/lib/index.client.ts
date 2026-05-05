/**
 * Gemini Agent Plugin - Client Entry Point
 *
 * Only client-safe exports: headless component, types, and init.
 * Server-only code (setup, config-loader, service, actions, agent logic)
 * is excluded from the client bundle.
 */

// Plugin init (client-side is a no-op, but needed for framework wiring)
export { init, GEMINI_SERVICE } from './init';

// Component
export { geminiChat } from './gemini-chat';

// Types (pure type exports — no runtime cost)
export type {
    GeminiMessage,
    GeminiPart,
    GeminiTextPart,
    GeminiFunctionCallPart,
    GeminiFunctionResponsePart,
    SerializedToolDef,
    SendMessageInput,
    SendMessageOutput,
    SubmitToolResultsInput,
    SubmitToolResultsOutput,
    PendingToolCall,
    ToolCallResult,
    GeminiFunctionDeclaration,
    GeminiServiceConfig,
} from './types';
