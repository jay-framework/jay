/**
 * Type declarations for the WebMCP API (navigator.modelContext)
 * Based on: https://github.com/webmachinelearning/webmcp/blob/main/docs/proposal.md
 */

export interface ToolInputSchema {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
}

export interface ToolContentItem {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
}

export interface ToolResult {
    content: ToolContentItem[];
    isError?: boolean;
}

export interface Agent {
    requestUserInteraction: <T>(callback: () => T | Promise<T>) => Promise<T>;
}

export interface ToolDescriptor {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    execute: (params: Record<string, unknown>, agent: Agent) => ToolResult | Promise<ToolResult>;
}

export interface ProvideContextParams {
    tools: ToolDescriptor[];
}

export interface ModelContextContainer {
    /** Set all tools at once (clears previously registered tools) */
    provideContext(params: ProvideContextParams): void;
    /** Register an individual tool (additive, does not clear existing tools) */
    registerTool(tool: ToolDescriptor): void;
    /** Unregister a previously registered tool by name */
    unregisterTool(name: string): void;
}

declare global {
    interface Navigator {
        modelContext?: ModelContextContainer;
    }
}
