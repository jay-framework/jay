// Plugin init
export { init } from './init';

// Bridge (for advanced usage / testing)
export { setupWebMCP } from './webmcp-bridge';

// Types
export type {
    ToolDescriptor,
    ToolResult,
    ToolInputSchema,
    ResourceDescriptor,
    PromptDescriptor,
    ModelContextContainer,
    Registration,
} from './webmcp-types';
