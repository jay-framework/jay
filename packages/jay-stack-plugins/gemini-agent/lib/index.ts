// Plugin init
export { init, GEMINI_SERVICE } from './init';

// Setup handler
export { setupGeminiAgent } from './setup';

// Server actions
export { sendMessage, submitToolResults } from './gemini-actions';

// Types
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
} from './gemini-types';

// Config
export type { GeminiAgentConfig } from './config-loader';

// Service
export { GeminiService } from './gemini-service';

// Component
export { geminiChat } from './gemini-chat';

// Tool bridge (for advanced usage / testing)
export { toGeminiTools, resolveToolCallTarget } from './tool-bridge';

// System prompt (for advanced usage / testing)
export { buildSystemPrompt } from './system-prompt';
export type { ServerActionSummary } from './system-prompt';
