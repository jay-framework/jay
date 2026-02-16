import { describe, it, expect } from 'vitest';
import { toGeminiTools, resolveToolCallTarget } from '../lib/tool-bridge';
import type { SerializedToolDef } from '../lib/gemini-types';
import type { ActionMetadata } from '@jay-framework/stack-server-runtime';

describe('tool-bridge', () => {
    describe('toGeminiTools', () => {
        it('should convert client tools to Gemini function declarations', () => {
            const clientTools: SerializedToolDef[] = [
                {
                    name: 'click-add-to-cart',
                    description: 'Click the Add to Cart button',
                    inputSchema: { type: 'object', properties: {}, required: [] },
                    category: 'page-automation',
                },
            ];

            const result = toGeminiTools(clientTools, []);

            expect(result).toEqual([
                {
                    name: 'click-add-to-cart',
                    description: 'Click the Add to Cart button',
                    parameters: { type: 'object', properties: {}, required: [] },
                },
            ]);
        });

        it('should convert server actions with metadata to Gemini declarations', () => {
            const metadata: ActionMetadata = {
                name: 'searchProducts',
                description: 'Search for products by query',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                    },
                    required: ['query'],
                },
            };

            const result = toGeminiTools(
                [],
                [{ actionName: 'wixStores.searchProducts', metadata }],
            );

            expect(result).toEqual([
                {
                    name: 'action_wixStores_searchProducts',
                    description: 'Search for products by query',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                        },
                        required: ['query'],
                    },
                },
            ]);
        });

        it('should combine client tools and server actions', () => {
            const clientTools: SerializedToolDef[] = [
                {
                    name: 'fill-search',
                    description: 'Fill the search input',
                    inputSchema: {
                        type: 'object',
                        properties: { value: { type: 'string' } },
                        required: ['value'],
                    },
                    category: 'page-automation',
                },
            ];

            const metadata: ActionMetadata = {
                name: 'getStats',
                description: 'Get stats',
                inputSchema: { type: 'object', properties: {} },
            };

            const result = toGeminiTools(clientTools, [
                { actionName: 'analytics.getStats', metadata },
            ]);

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('fill-search');
            expect(result[1].name).toBe('action_analytics_getStats');
        });

        it('should return empty array when no tools', () => {
            expect(toGeminiTools([], [])).toEqual([]);
        });
    });

    describe('resolveToolCallTarget', () => {
        it('should resolve client tool names', () => {
            const clientNames = new Set(['click-add-to-cart', 'fill-search']);

            expect(resolveToolCallTarget('click-add-to-cart', clientNames)).toEqual({
                category: 'page-automation',
                name: 'click-add-to-cart',
            });
        });

        it('should resolve server action names (reverse the prefix and replacement)', () => {
            const clientNames = new Set(['click-add-to-cart']);

            expect(resolveToolCallTarget('action_wixStores_searchProducts', clientNames)).toEqual({
                category: 'server-action',
                name: 'wixStores.searchProducts',
            });
        });

        it('should fall back to page-automation for unknown tools', () => {
            const clientNames = new Set<string>();

            expect(resolveToolCallTarget('unknown-tool', clientNames)).toEqual({
                category: 'page-automation',
                name: 'unknown-tool',
            });
        });
    });
});
