/**
 * Type declarations for the WebMCP API (navigator.modelContext)
 * Based on: https://github.com/nichochar/web-mcp
 *
 * Extended with Resources and Prompts beyond the cart-webmcp example.
 */

// ── Tool Types ──────────────────────────────────────────────────────────────

export interface ToolInputSchema {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
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

// ── Resource Types ──────────────────────────────────────────────────────────

export interface ResourceContentsItem {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
}

export interface ResourceReadResult {
    contents: ResourceContentsItem[];
}

export interface ResourceDescriptor {
    uri: string;
    name: string;
    description: string;
    mimeType?: string;
    read: () => ResourceReadResult | Promise<ResourceReadResult>;
}

// ── Prompt Types ────────────────────────────────────────────────────────────

export interface PromptMessage {
    role: 'user' | 'assistant';
    content: { type: 'text'; text: string };
}

export interface PromptGetResult {
    messages: PromptMessage[];
}

export interface PromptDescriptor {
    name: string;
    description: string;
    get: () => PromptGetResult | Promise<PromptGetResult>;
}

// ── Registration Return ─────────────────────────────────────────────────────

export interface Registration {
    unregister(): void;
}

// ── ModelContextContainer ───────────────────────────────────────────────────

export interface ModelContextContainer {
    /** Set all tools at once (clears previously registered tools) */
    provideContext(params: { tools: ToolDescriptor[] }): void;
    /** Register an individual tool (additive) */
    registerTool(tool: ToolDescriptor): Registration;
    /** Unregister a previously registered tool by name */
    unregisterTool(name: string): void;
    /** Register a resource */
    registerResource(resource: ResourceDescriptor): Registration;
    /** Register a prompt */
    registerPrompt(prompt: PromptDescriptor): Registration;
}

declare global {
    interface Navigator {
        modelContext?: ModelContextContainer;
    }
}
