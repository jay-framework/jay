import { describe, it, expect } from 'vitest';
import {
    toGeminiTools,
    toSlimGeminiTools,
    buildToolSummary,
    resolveToolCallTarget,
    DISCOVERY_TOOL,
    PAGE_STATE_TOOL,
} from '../lib/agent/tool-bridge';
import type { SerializedToolDef } from '../lib/types';
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

    describe('toSlimGeminiTools', () => {
        it('should strip parameters from tools', () => {
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

            const result = toSlimGeminiTools(clientTools, []);

            expect(result).toEqual([
                {
                    name: 'fill-search',
                    description: 'Fill the search input',
                    parameters: { type: 'object', properties: {} },
                },
            ]);
        });
    });

    describe('DISCOVERY_TOOL', () => {
        it('should have the correct name', () => {
            expect(DISCOVERY_TOOL.name).toBe('get_tool_details');
        });

        it('should accept tool_names as a required parameter', () => {
            expect(DISCOVERY_TOOL.parameters.properties.tool_names).toBeDefined();
            expect(DISCOVERY_TOOL.parameters.required).toEqual(['tool_names']);
        });
    });

    describe('PAGE_STATE_TOOL', () => {
        it('should have the correct name', () => {
            expect(PAGE_STATE_TOOL.name).toBe('get_page_state');
        });

        it('should have no required parameters', () => {
            expect(Object.keys(PAGE_STATE_TOOL.parameters.properties)).toHaveLength(0);
        });
    });

    describe('buildToolSummary', () => {
        it('should list client tools with param names', () => {
            const clientTools: SerializedToolDef[] = [
                {
                    name: 'click-add-to-cart',
                    description: 'Click add to cart',
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
                {
                    name: 'fill-quantity',
                    description: 'Fill quantity for a specific item',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            coordinate: { type: 'string' },
                            value: { type: 'string' },
                        },
                        required: ['coordinate', 'value'],
                    },
                    category: 'page-automation',
                },
            ];

            const result = buildToolSummary(clientTools, []);

            expect(result).toBe(
                '- click-add-to-cart: Click add to cart\n' +
                    '- fill-search: Fill search (params: value)\n' +
                    '- fill-quantity: Fill quantity for a specific item (params: coordinate, value)',
            );
        });

        it('should include server actions', () => {
            const metadata: ActionMetadata = {
                name: 'search',
                description: 'Search products',
                inputSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                },
            };

            const result = buildToolSummary([], [{ actionName: 'store.search', metadata }]);

            expect(result).toBe('- action_store_search: Search products (params: query)');
        });

        it('should return empty string when no tools', () => {
            expect(buildToolSummary([], [])).toBe('');
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
