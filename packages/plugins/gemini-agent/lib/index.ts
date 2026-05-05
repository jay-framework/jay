// Plugin init
export { init, GEMINI_SERVICE } from './init';

// Setup handler
export { setupGeminiAgent } from './setup';

// Server actions
export { sendMessage, submitToolResults, getToolDescriptions } from './actions/handlers';

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
} from './types';

// Config
export type { GeminiAgentConfig } from './config-loader';

// Service
export { GeminiService } from './agent/service';

// Component
export { geminiChat } from './gemini-chat';

// Tool bridge (for advanced usage / testing)
export {
    toGeminiTools,
    toSlimGeminiTools,
    buildToolSummary,
    resolveToolCallTarget,
    DISCOVERY_TOOL,
    PAGE_STATE_TOOL,
} from './agent/tool-bridge';

// System prompt (for advanced usage / testing)
export { buildSystemPrompt, compactPageState } from './agent/system-prompt';
