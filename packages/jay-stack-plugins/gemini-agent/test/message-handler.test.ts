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
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toBe('Hello! How can I help?');
                expect(result.history).toHaveLength(2);
                expect(result.history[1].role).toBe('model');
            }
        });

        it('should return tool-calls when Gemini requests page automation tools', async () => {
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
            const history: GeminiMessage[] = [
                { role: 'user', parts: [{ text: 'Add item to cart' }] },
            ];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                clientTools,
                emptyLookup,
                emptyPageState,
            );

            expect(result.type).toBe('tool-calls');
            if (result.type === 'tool-calls') {
                expect(result.calls).toHaveLength(1);
                expect(result.calls[0].name).toBe('click-add-to-cart');
                expect(result.calls[0].category).toBe('page-automation');
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

            const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: 'Find shoes' }] }];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                emptyPageState,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toBe('I found some shoes for you!');
            }

            expect(actionRegistry.execute).toHaveBeenCalledWith('store.searchProducts', {
                query: 'shoes',
            });
            expect(service.generateWithTools).toHaveBeenCalledTimes(2);
        });

        it('should handle empty/malformed responses gracefully', async () => {
            const service = mockService(() => ({
                candidates: [],
            }));

            const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: 'Hello' }] }];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                emptyPageState,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toContain('unable to generate');
            }
        });

        it('should handle mixed server + client tool calls', async () => {
            const { actionRegistry } = await import('@jay-framework/stack-server-runtime');

            const service = mockService(() => ({
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    functionCall: {
                                        name: 'action_store_search',
                                        args: { q: 'test' },
                                    },
                                },
                                {
                                    functionCall: {
                                        name: 'click-button',
                                        args: {},
                                    },
                                },
                            ],
                        },
                    },
                ],
            }));

            vi.mocked(actionRegistry.execute).mockResolvedValue({
                success: true,
                data: { found: true },
            });

            const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: 'Do stuff' }] }];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                new Set(['click-button']),
                emptyLookup,
                emptyPageState,
            );

            // Has client calls → returns tool-calls
            expect(result.type).toBe('tool-calls');
            if (result.type === 'tool-calls') {
                // Only client calls are pending
                expect(result.calls).toHaveLength(1);
                expect(result.calls[0].name).toBe('click-button');
                expect(result.calls[0].category).toBe('page-automation');
            }

            // Server action was still executed
            expect(actionRegistry.execute).toHaveBeenCalledWith('store.search', { q: 'test' });
        });

        it('should handle get_tool_details calls and return full schemas', async () => {
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
                                                    tool_names: [
                                                        'fill-quantity',
                                                        'click-add-to-cart',
                                                    ],
                                                },
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
                                parts: [{ text: 'I see, let me fill the quantity.' }],
                            },
                        },
                    ],
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
                                coordinate: {
                                    type: 'string',
                                    enum: ['0/0', '0/1'],
                                },
                                value: { type: 'string' },
                            },
                            required: ['coordinate', 'value'],
                        },
                    },
                ],
                [
                    'click-add-to-cart',
                    {
                        name: 'click-add-to-cart',
                        description: 'Click add to cart',
                        parameters: { type: 'object', properties: {} },
                    },
                ],
            ]);

            const history: GeminiMessage[] = [
                { role: 'user', parts: [{ text: 'Set quantity to 3' }] },
            ];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                new Set(['fill-quantity', 'click-add-to-cart']),
                fullToolLookup,
                emptyPageState,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toBe('I see, let me fill the quantity.');
            }

            // Should have been called twice: once for discovery, once for the follow-up
            expect(service.generateWithTools).toHaveBeenCalledTimes(2);

            // Second call should include the discovery result in history
            const secondCallHistory = vi.mocked(service.generateWithTools).mock
                .calls[1][0] as GeminiMessage[];
            const functionResponsePart = secondCallHistory.find(
                (m) =>
                    m.role === 'user' &&
                    m.parts.some((p: any) => p.functionResponse?.name === 'get_tool_details'),
            );
            expect(functionResponsePart).toBeDefined();
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
                                    parts: [
                                        {
                                            functionCall: {
                                                name: 'get_page_state',
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
                                parts: [{ text: 'There are 5 products on the page.' }],
                            },
                        },
                    ],
                };
            });

            const pageState = {
                products: [
                    { name: 'Shoe A' },
                    { name: 'Shoe B' },
                    { name: 'Shoe C' },
                    { name: 'Shoe D' },
                    { name: 'Shoe E' },
                ],
            };

            const history: GeminiMessage[] = [
                { role: 'user', parts: [{ text: 'How many products?' }] },
            ];

            const result = await processGeminiTurn(
                service,
                history,
                [],
                'System prompt',
                new Set(),
                emptyLookup,
                pageState,
            );

            expect(result.type).toBe('response');
            if (result.type === 'response') {
                expect(result.message).toBe('There are 5 products on the page.');
            }

            // Should have been called twice: once for get_page_state, once for text
            expect(service.generateWithTools).toHaveBeenCalledTimes(2);

            // Second call should include full page state in history
            const secondCallHistory = vi.mocked(service.generateWithTools).mock
                .calls[1][0] as GeminiMessage[];
            const functionResponsePart = secondCallHistory.find(
                (m) =>
                    m.role === 'user' &&
                    m.parts.some((p: any) => p.functionResponse?.name === 'get_page_state'),
            );
            expect(functionResponsePart).toBeDefined();

            // The response should contain the full page state (all 5 products)
            const responseParts = functionResponsePart!.parts;
            const pageStateResponse = responseParts.find(
                (p: any) => p.functionResponse?.name === 'get_page_state',
            ) as any;
            expect(pageStateResponse.functionResponse.response.products).toHaveLength(5);
        });
    });

    describe('handleConversation', () => {
        it('should build slim tools and system prompt and process turn', async () => {
            const service = mockService(() => ({
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Response text' }],
                        },
                    },
                ],
            }));

            const toolDefs: SerializedToolDef[] = [
                {
                    name: 'click-btn',
                    description: 'Click button',
                    inputSchema: { type: 'object', properties: {} },
                    category: 'page-automation',
                },
            ];

            const result = await handleConversation(
                service,
                [{ role: 'user', parts: [{ text: 'Hello' }] }],
                toolDefs,
                { viewState: { title: 'Test' } },
            );

            expect(result.type).toBe('response');

            // System prompt should include page state (compact)
            const systemPromptArg = vi.mocked(service.generateWithTools).mock.calls[0][2];
            expect(systemPromptArg).toContain('Test');

            // Tools sent should include slim tools + both meta-tools
            const toolsArg = vi.mocked(service.generateWithTools).mock
                .calls[0][1] as GeminiFunctionDeclaration[];
            expect(toolsArg.some((t) => t.name === 'get_tool_details')).toBe(true);
            expect(toolsArg.some((t) => t.name === 'get_page_state')).toBe(true);
            const clickBtn = toolsArg.find((t) => t.name === 'click-btn');
            expect(clickBtn).toBeDefined();
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
                    actionName: 'geminiAgent.submitToolResults',
                    metadata: {
                        name: 'submitToolResults',
                        description: 'Submit tool results',
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
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Response' }],
                        },
                    },
                ],
            }));

            await handleConversation(service, [{ role: 'user', parts: [{ text: 'Hi' }] }], [], {});

            const toolsArg = vi.mocked(service.generateWithTools).mock
                .calls[0][1] as GeminiFunctionDeclaration[];
            const toolNames = toolsArg.map((t) => t.name);

            // Should NOT include gemini agent's own actions
            expect(toolNames).not.toContain('action_geminiAgent_sendMessage');
            expect(toolNames).not.toContain('action_geminiAgent_submitToolResults');

            // Should include other server actions
            expect(toolNames).toContain('action_wixStoresV1_searchProducts');

            // Should include meta-tools
            expect(toolNames).toContain('get_tool_details');
            expect(toolNames).toContain('get_page_state');
        });
    });
});
