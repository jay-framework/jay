import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleConversation, processGeminiTurn } from '../lib/agent/message-handler';
import { GeminiService } from '../lib/agent/service';
import type { GeminiMessage, GeminiFunctionDeclaration, SerializedToolDef } from '../lib/types';

// Mock dependencies
vi.mock('@jay-framework/stack-server-runtime', () => ({
    actionRegistry: {
        getActionsWithMetadata: vi.fn(() => []),
        execute: vi.fn(async () => ({ success: true, data: { result: 'ok' } })),
    },
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn(),
    Type: {},
}));

vi.mock('@jay-framework/logger', () => ({
    getLogger: () => ({
        important: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

function mockService(responseFactory: () => any): GeminiService {
    const service = Object.create(GeminiService.prototype);
    service.config = { apiKey: 'test', model: 'gemini-2.0-flash' };
    service.generateWithTools = vi.fn(responseFactory);
    Object.defineProperty(service, 'model', { get: () => 'gemini-2.0-flash' });
    Object.defineProperty(service, 'systemPromptPrefix', { get: () => undefined });
    return service;
}

const emptyLookup = new Map<string, GeminiFunctionDeclaration>();
const emptyPageState = {};
const emptyDiscovered = new Set<string>();

describe('message-handler', () => {
    describe('processGeminiTurn', () => {
        it('should return text response when Gemini returns text', async () => {
            const service = mockService(() => ({
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Hello! How can I help?' }],
                        },
                    },
                ],
            }));

            const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: 'Hi' }] }];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                emptyPageState,
                emptyDiscovered,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toBe('Hello! How can I help?');
                expect(result.history).toHaveLength(2);
                expect(result.history[1].role).toBe('model');
            }
        });

        it('should reject undiscovered tool calls with error', async () => {
            let callCount = 0;
            const service = mockService(() => {
                callCount++;
                if (callCount === 1) {
                    return {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            functionCall: {
                                                name: 'click-add-to-cart',
                                                args: {},
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                }
                return {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: 'Let me discover the tool first.' }],
                            },
                        },
                    ],
                };
            });

            const result = await processGeminiTurn(
                service,
                [{ role: 'user', parts: [{ text: 'Add to cart' }] }],
                [],
                'System prompt',
                new Set(['click-add-to-cart']),
                emptyLookup,
                emptyPageState,
                new Set<string>(),
            );

            // Should have recursed: first call rejected, second call text
            expect(service.generateWithTools).toHaveBeenCalledTimes(2);

            // The error response should be in the history of the second call
            const secondCallHistory = vi.mocked(service.generateWithTools).mock
                .calls[1][0] as GeminiMessage[];
            const errorPart = secondCallHistory.find(
                (m) =>
                    m.role === 'user' &&
                    m.parts.some(
                        (p: any) =>
                            p.functionResponse?.name === 'click-add-to-cart' &&
                            p.functionResponse?.response?.error,
                    ),
            );
            expect(errorPart).toBeDefined();
        });

        it('should allow discovered tool calls through', async () => {
            const service = mockService(() => ({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    functionCall: {
                                        name: 'click-add-to-cart',
                                        args: {},
                                    },
                                },
                            ],
                        },
                    },
                ],
            }));

            const clientTools = new Set(['click-add-to-cart']);
            const discovered = new Set(['click-add-to-cart']);

            const result = await processGeminiTurn(
                service,
                [{ role: 'user', parts: [{ text: 'Add to cart' }] }],
                [],
                'System prompt',
                clientTools,
                emptyLookup,
                emptyPageState,
                discovered,
            );

            expect(result.type).toBe('tool-calls');
            if (result.type === 'tool-calls') {
                expect(result.calls).toHaveLength(1);
                expect(result.calls[0].name).toBe('click-add-to-cart');
            }
        });

        it('should execute server actions and recurse for more responses', async () => {
            const { actionRegistry } = await import('@jay-framework/stack-server-runtime');

            let callCount = 0;
            const service = mockService(() => {
                callCount++;
                if (callCount === 1) {
                    return {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            functionCall: {
                                                name: 'action_store_searchProducts',
                                                args: { query: 'shoes' },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                }
                return {
                    candidates: [
                        {
                            content: {
                                parts: [{ text: 'I found some shoes for you!' }],
                            },
                        },
                    ],
                };
            });

            vi.mocked(actionRegistry.execute).mockResolvedValue({
                success: true,
                data: [{ name: 'Running Shoe', price: 99 }],
            });

            const discovered = new Set(['action_store_searchProducts']);

            const result = await processGeminiTurn(
                service,
                [{ role: 'user', parts: [{ text: 'Find shoes' }] }],
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                emptyPageState,
                discovered,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toBe('I found some shoes for you!');
            }

            expect(actionRegistry.execute).toHaveBeenCalledWith('store.searchProducts', {
                query: 'shoes',
            });
        });

        it('should handle empty/malformed responses gracefully', async () => {
            const service = mockService(() => ({
                candidates: [],
            }));

            const result = await processGeminiTurn(
                service,
                [{ role: 'user', parts: [{ text: 'Hello' }] }],
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                emptyPageState,
                emptyDiscovered,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toContain('unable to generate');
            }
        });

        it('should handle get_tool_details, upgrade declarations, and mark as discovered', async () => {
            let callCount = 0;
            const service = mockService(() => {
                callCount++;
                if (callCount === 1) {
                    return {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            functionCall: {
                                                name: 'get_tool_details',
                                                args: {
                                                    tool_names: ['fill-quantity'],
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                }
                // After discovery, call the tool
                if (callCount === 2) {
                    return {
                        candidates: [
                            {
                                content: {
                                    parts: [
                                        {
                                            functionCall: {
                                                name: 'fill-quantity',
                                                args: { coordinate: '0/0', value: '3' },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    };
                }
                return {
                    candidates: [{ content: { parts: [{ text: 'Done' }] } }],
                };
            });

            const fullToolLookup = new Map<string, GeminiFunctionDeclaration>([
                [
                    'fill-quantity',
                    {
                        name: 'fill-quantity',
                        description: 'Fill quantity',
                        parameters: {
                            type: 'object',
                            properties: {
                                coordinate: { type: 'string', enum: ['0/0', '0/1'] },
                                value: { type: 'string' },
                            },
                            required: ['coordinate', 'value'],
                        },
                    },
                ],
            ]);

            // Start with slim declaration
            const slimTools: GeminiFunctionDeclaration[] = [
                {
                    name: 'fill-quantity',
                    description: 'Fill quantity',
                    parameters: { type: 'object', properties: {} },
                },
            ];

            const result = await processGeminiTurn(
                service,
                [{ role: 'user', parts: [{ text: 'Set qty to 3' }] }],
                slimTools,
                'System prompt',
                new Set(['fill-quantity']),
                fullToolLookup,
                emptyPageState,
                new Set<string>(),
            );

            // Turn 1: discover, Turn 2: call fill-quantity (now discovered → goes to client)
            expect(result.type).toBe('tool-calls');
            if (result.type === 'tool-calls') {
                expect(result.calls[0].name).toBe('fill-quantity');
            }

            // Second call should have full declaration (not slim)
            const secondCallTools = vi.mocked(service.generateWithTools).mock
                .calls[1][1] as GeminiFunctionDeclaration[];
            const fillQty = secondCallTools.find((t) => t.name === 'fill-quantity');
            expect(fillQty!.parameters.properties.coordinate).toBeDefined();
            expect(fillQty!.parameters.properties.coordinate.enum).toEqual(['0/0', '0/1']);
        });

        it('should handle get_page_state calls and return full page state', async () => {
            let callCount = 0;
            const service = mockService(() => {
                callCount++;
                if (callCount === 1) {
                    return {
                        candidates: [
                            {
                                content: {
                                    parts: [{ functionCall: { name: 'get_page_state', args: {} } }],
                                },
                            },
                        ],
                    };
                }
                return {
                    candidates: [{ content: { parts: [{ text: '5 products.' }] } }],
                };
            });

            const pageState = {
                products: Array.from({ length: 5 }, (_, i) => ({ name: `P${i}` })),
            };

            const result = await processGeminiTurn(
                service,
                [{ role: 'user', parts: [{ text: 'How many?' }] }],
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                pageState,
                emptyDiscovered,
            );

            expect(result.type).toBe('response');
            expect(service.generateWithTools).toHaveBeenCalledTimes(2);
        });
    });

    describe('handleConversation', () => {
        it('should send slim tools + meta-tools as declarations', async () => {
            const service = mockService(() => ({
                candidates: [{ content: { parts: [{ text: 'Response text' }] } }],
            }));

            const toolDefs: SerializedToolDef[] = [
                {
                    name: 'click-btn',
                    description: 'Click button',
                    inputSchema: { type: 'object', properties: {} },
                    category: 'page-automation',
                },
                {
                    name: 'fill-search',
                    description: 'Fill search',
                    inputSchema: {
                        type: 'object',
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                    },
                    category: 'page-automation',
                },
            ];

            await handleConversation(
                service,
                [{ role: 'user', parts: [{ text: 'Hello' }] }],
                toolDefs,
                { viewState: { title: 'Test' } },
            );

            const toolsArg = vi.mocked(service.generateWithTools).mock
                .calls[0][1] as GeminiFunctionDeclaration[];
            const toolNames = toolsArg.map((t) => t.name);

            // Slim tools + meta-tools
            expect(toolNames).toContain('click-btn');
            expect(toolNames).toContain('fill-search');
            expect(toolNames).toContain('get_tool_details');
            expect(toolNames).toContain('get_page_state');

            // Slim tools should have empty parameters
            const clickBtn = toolsArg.find((t) => t.name === 'click-btn');
            expect(clickBtn!.parameters).toEqual({ type: 'object', properties: {} });
        });

        it('should exclude gemini agent own actions from tools', async () => {
            const { actionRegistry } = await import('@jay-framework/stack-server-runtime');

            vi.mocked(actionRegistry.getActionsWithMetadata).mockReturnValue([
                {
                    actionName: 'geminiAgent.sendMessage',
                    metadata: {
                        name: 'sendMessage',
                        description: 'Send a message',
                        inputSchema: { type: 'object', properties: {} },
                    },
                },
                {
                    actionName: 'wixStoresV1.searchProducts',
                    metadata: {
                        name: 'searchProducts',
                        description: 'Search for products',
                        inputSchema: {
                            type: 'object',
                            properties: { query: { type: 'string' } },
                        },
                    },
                },
            ] as any);

            const service = mockService(() => ({
                candidates: [{ content: { parts: [{ text: 'Response' }] } }],
            }));

            await handleConversation(service, [{ role: 'user', parts: [{ text: 'Hi' }] }], [], {});

            const toolsArg = vi.mocked(service.generateWithTools).mock
                .calls[0][1] as GeminiFunctionDeclaration[];
            const toolNames = toolsArg.map((t) => t.name);

            expect(toolNames).not.toContain('action_geminiAgent_sendMessage');
            expect(toolNames).toContain('action_wixStoresV1_searchProducts');
        });
    });
});
