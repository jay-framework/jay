/**
 * WebMCP Polyfill
 *
 * Implements the proposed navigator.modelContext API from the WebMCP spec:
 * https://github.com/webmachinelearning/webmcp
 *
 * Since no browser implements WebMCP yet, this polyfill:
 * 1. Provides the provideContext / registerTool / unregisterTool API
 * 2. Exposes a `window.webmcp` console helper for discovering and invoking tools
 *    (simulating what an AI agent or browser assistant would do)
 */

// ── WebMCP Types (aligned with the spec proposal) ──────────────────────────

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

/**
 * Represents an agent invoking a tool.
 * Passed as the second argument to a tool's execute function.
 */
export interface Agent {
    /**
     * Request user interaction during tool execution.
     * The callback runs in user-interaction context (can show dialogs, etc).
     */
    requestUserInteraction: <T>(callback: () => T | Promise<T>) => Promise<T>;
}

export interface ToolDescriptor {
    name: string;
    description: string;
    inputSchema: ToolInputSchema;
    execute: (params: Record<string, unknown>, agent: Agent) => ToolResult | Promise<ToolResult>;
}

export interface ModelContextProvideOptions {
    tools: ToolDescriptor[];
}

export interface ModelContextContainer {
    provideContext(options: ModelContextProvideOptions): void;
    registerTool(tool: ToolDescriptor): void;
    unregisterTool(name: string): void;
    /** Non-spec: access registered tools (for the polyfill console helper) */
    _tools: Map<string, ToolDescriptor>;
}

// ── Polyfill Agent (simulates a browser agent) ─────────────────────────────

const polyfillAgent: Agent = {
    requestUserInteraction: async <T>(callback: () => T | Promise<T>): Promise<T> => {
        return await callback();
    },
};

// ── ModelContextContainer Implementation ────────────────────────────────────

function createModelContextContainer(): ModelContextContainer {
    const tools = new Map<string, ToolDescriptor>();

    const container: ModelContextContainer = {
        _tools: tools,

        provideContext(options: ModelContextProvideOptions) {
            // Per spec: subsequent calls clear pre-existing tools before registering new ones
            tools.clear();
            for (const tool of options.tools) {
                tools.set(tool.name, tool);
            }
            console.log(
                `%c[WebMCP] provideContext: registered ${options.tools.length} tool(s)`,
                'color: #7c4dff; font-weight: bold',
            );
            for (const tool of options.tools) {
                console.log(`  - ${tool.name}: ${tool.description}`);
            }
        },

        registerTool(tool: ToolDescriptor) {
            tools.set(tool.name, tool);
            console.log(
                `%c[WebMCP] registerTool: ${tool.name}`,
                'color: #7c4dff; font-weight: bold',
            );
        },

        unregisterTool(name: string) {
            const removed = tools.delete(name);
            if (removed) {
                console.log(
                    `%c[WebMCP] unregisterTool: ${name}`,
                    'color: #7c4dff; font-weight: bold',
                );
            }
        },
    };

    return container;
}

// ── Console Helper (simulates what an agent would do) ───────────────────────

export interface WebMCPConsoleHelper {
    /** List all registered tools with their descriptions and schemas */
    tools: () => void;
    /** Invoke a tool by name with the given parameters */
    call: (toolName: string, params?: Record<string, unknown>) => Promise<ToolResult>;
    /** Show help */
    help: () => void;
    /** Get the raw tool descriptors (for programmatic use) */
    getTools: () => ToolDescriptor[];
    /** Get the MCP-compatible tool listing (like tools/list response) */
    listTools: () => { tools: Array<{ name: string; description: string; inputSchema: ToolInputSchema }> };
}

function createConsoleHelper(container: ModelContextContainer): WebMCPConsoleHelper {
    return {
        tools: () => {
            const tools = Array.from(container._tools.values());
            if (tools.length === 0) {
                console.log('%c[WebMCP] No tools registered', 'color: #ff9800');
                return;
            }
            console.log(
                `%c[WebMCP] ${tools.length} registered tool(s):`,
                'color: #7c4dff; font-weight: bold; font-size: 13px',
            );
            console.log('');
            for (const tool of tools) {
                console.log(`%c  ${tool.name}`, 'color: #2196F3; font-weight: bold');
                console.log(`    ${tool.description}`);
                const props = tool.inputSchema.properties;
                const required = new Set(tool.inputSchema.required || []);
                const paramNames = Object.keys(props);
                if (paramNames.length > 0) {
                    console.log('    Parameters:');
                    for (const name of paramNames) {
                        const prop = props[name];
                        const req = required.has(name) ? ' (required)' : ' (optional)';
                        const enumStr = prop.enum ? ` [${prop.enum.join(', ')}]` : '';
                        console.log(`      ${name}: ${prop.type}${req}${enumStr} — ${prop.description}`);
                    }
                }
                console.log('');
            }
        },

        call: async (toolName: string, params: Record<string, unknown> = {}) => {
            const tool = container._tools.get(toolName);
            if (!tool) {
                const error = `Tool "${toolName}" not found. Use webmcp.tools() to see available tools.`;
                console.error(`%c[WebMCP] ${error}`, 'color: #f44336');
                return { content: [{ type: 'text' as const, text: error }], isError: true };
            }

            console.log(
                `%c[WebMCP] Calling tool: ${toolName}`,
                'color: #4CAF50; font-weight: bold',
            );
            if (Object.keys(params).length > 0) {
                console.log('  params:', params);
            }

            try {
                const result = await tool.execute(params, polyfillAgent);
                console.log('%c[WebMCP] Tool result:', 'color: #4CAF50; font-weight: bold');
                for (const item of result.content) {
                    if (item.type === 'text') {
                        console.log(`  ${item.text}`);
                    }
                }
                return result;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`%c[WebMCP] Tool error: ${message}`, 'color: #f44336');
                return { content: [{ type: 'text' as const, text: message }], isError: true };
            }
        },

        help: () => {
            console.log(
                '%c=== WebMCP Console Helper ===',
                'color: #7c4dff; font-weight: bold; font-size: 14px',
            );
            console.log('');
            console.log(
                'This polyfill simulates the WebMCP API (navigator.modelContext).',
            );
            console.log(
                'In production, an AI agent or browser assistant would call these tools.',
            );
            console.log('');
            console.log('%cCommands:', 'color: #2196F3; font-weight: bold');
            console.log('  webmcp.tools()                          - List all registered tools');
            console.log(
                '  webmcp.call("tool-name", { ...params }) - Invoke a tool (like an agent would)',
            );
            console.log('  webmcp.listTools()                      - Get MCP-compatible tool listing (JSON)');
            console.log('  webmcp.getTools()                       - Get raw tool descriptors');
            console.log('');
            console.log('%cExamples:', 'color: #FF9800; font-weight: bold');
            console.log('  webmcp.call("get-cart-state")');
            console.log('  webmcp.call("add-item", { name: "Laptop Stand", price: 45.99 })');
            console.log('  webmcp.call("remove-item", { itemId: "item-1" })');
            console.log(
                '  webmcp.call("update-quantity", { itemId: "item-1", action: "increase" })',
            );
            console.log('');
        },

        getTools: () => Array.from(container._tools.values()),

        listTools: () => ({
            tools: Array.from(container._tools.values()).map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        }),
    };
}

// ── Install Polyfill ────────────────────────────────────────────────────────

declare global {
    interface Navigator {
        modelContext: ModelContextContainer;
    }
    interface Window {
        webmcp: WebMCPConsoleHelper;
    }
}

/**
 * Install the WebMCP polyfill on navigator.modelContext.
 * Returns the console helper for window.webmcp.
 */
export function installWebMCPPolyfill(): WebMCPConsoleHelper {
    if ('modelContext' in navigator) {
        console.log(
            '%c[WebMCP] Native navigator.modelContext detected — polyfill skipped',
            'color: #4CAF50',
        );
        // Still create a console helper for the native API
        // (would need adapter — for now, just return a basic wrapper)
    }

    const container = createModelContextContainer();

    // Install on navigator (non-writable in real browsers, but works in polyfill context)
    Object.defineProperty(navigator, 'modelContext', {
        value: container,
        writable: false,
        configurable: true,
    });

    const helper = createConsoleHelper(container);
    window.webmcp = helper;

    return helper;
}
