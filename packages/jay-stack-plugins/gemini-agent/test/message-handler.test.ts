import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleConversation, processGeminiTurn } from '../lib/message-handler';
import { GeminiService } from '../lib/gemini-service';
import type { GeminiMessage, SerializedToolDef } from '../lib/gemini-types';

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

function mockService(responseFactory: () => any): GeminiService {
    const service = Object.create(GeminiService.prototype);
    service.config = { apiKey: 'test', model: 'gemini-2.0-flash' };
    service.generateWithTools = vi.fn(responseFactory);
    Object.defineProperty(service, 'model', { get: () => 'gemini-2.0-flash' });
    Object.defineProperty(service, 'systemPromptPrefix', { get: () => undefined });
    return service;
}

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
    });

    describe('handleConversation', () => {
        it('should build tools and system prompt and process turn', async () => {
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
            // System prompt should include page state
            const systemPromptArg = vi.mocked(service.generateWithTools).mock.calls[0][2];
            expect(systemPromptArg).toContain('Test');
        });
    });
});
