/**
 * Type declarations for the WebMCP API (navigator.modelContext)
 *
 * Based on Chrome Canary's actual ModelContext API:
 *   - clearContext
 *   - provideContext
 *   - registerTool
 *   - unregisterTool
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

// ── ModelContextContainer ───────────────────────────────────────────────────

export interface ModelContextContainer {
    /** Clear all registered tools and context */
    clearContext(): void;
    /** Set all tools at once (replaces previously registered tools) */
    provideContext(params: { tools: ToolDescriptor[] }): void;
    /** Register an individual tool (additive) */
    registerTool(tool: ToolDescriptor): void;
    /** Unregister a previously registered tool by name */
    unregisterTool(name: string): void;
}

declare global {
    interface Navigator {
        modelContext?: ModelContextContainer;
    }
}
