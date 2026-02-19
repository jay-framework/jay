import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, compactPageState } from '../lib/agent/system-prompt';

describe('system-prompt', () => {
    describe('compactPageState', () => {
        it('should pass through small values unchanged', () => {
            expect(compactPageState({ title: 'Test', count: 5 })).toEqual({
                title: 'Test',
                count: 5,
            });
        });

        it('should truncate arrays longer than 3 items', () => {
            const result = compactPageState([1, 2, 3, 4, 5]) as unknown[];

            expect(result).toHaveLength(4);
            expect(result[0]).toBe(1);
            expect(result[1]).toBe(2);
            expect(result[2]).toBe(3);
            expect(result[3]).toBe('... (5 total)');
        });

        it('should keep arrays with 3 or fewer items intact', () => {
            expect(compactPageState([1, 2, 3])).toEqual([1, 2, 3]);
        });

        it('should truncate long strings at 200 chars', () => {
            const long = 'a'.repeat(300);
            const result = compactPageState(long) as string;

            expect(result).toHaveLength(203); // 200 + '...'
            expect(result.endsWith('...')).toBe(true);
        });

        it('should keep short strings intact', () => {
            expect(compactPageState('hello')).toBe('hello');
        });

        it('should recurse into nested objects', () => {
            const input = {
                items: [1, 2, 3, 4, 5],
                nested: { description: 'a'.repeat(300) },
            };
            const result = compactPageState(input) as any;

            expect(result.items).toHaveLength(4);
            expect(result.items[3]).toBe('... (5 total)');
            expect(result.nested.description).toHaveLength(203);
        });

        it('should handle null and undefined', () => {
            expect(compactPageState(null)).toBe(null);
            expect(compactPageState(undefined)).toBe(undefined);
        });

        it('should handle nested arrays within objects', () => {
            const input = { data: { list: ['a', 'b', 'c', 'd'] } };
            const result = compactPageState(input) as any;

            expect(result.data.list).toEqual(['a', 'b', 'c', '... (4 total)']);
        });
    });

    describe('buildSystemPrompt', () => {
        it('should include page state as compact JSON context', () => {
            const pageState = { viewState: { title: 'Test' }, interactions: [] };

            const prompt = buildSystemPrompt(pageState, '');

            expect(prompt).toContain('"title":"Test"');
            expect(prompt).toContain('## Current Page State');
            // Should NOT be pretty-printed
            expect(prompt).not.toContain('"title": "Test"');
        });

        it('should include tool summary when provided', () => {
            const toolSummary =
                '- click-add-to-cart: Click add to cart\n- fill-search: Fill search (params: value)';

            const prompt = buildSystemPrompt({}, toolSummary);

            expect(prompt).toContain('## Available Tools');
            expect(prompt).toContain('- click-add-to-cart: Click add to cart');
            expect(prompt).toContain('- fill-search: Fill search (params: value)');
        });

        it('should omit tools section when summary is empty', () => {
            const prompt = buildSystemPrompt({}, '');

            expect(prompt).not.toContain('## Available Tools');
        });

        it('should use custom prefix when provided', () => {
            const prompt = buildSystemPrompt({}, '', 'You are a shopping assistant.');

            expect(prompt).toContain('You are a shopping assistant.');
            expect(prompt).not.toContain('You are a helpful assistant');
        });

        it('should use default prefix when no custom prefix', () => {
            const prompt = buildSystemPrompt({}, '');

            expect(prompt).toContain('You are a helpful assistant for this web application.');
        });

        it('should include discovery tool instructions', () => {
            const prompt = buildSystemPrompt({}, '');

            expect(prompt).toContain('get_tool_details');
            expect(prompt).toContain('get_page_state');
            expect(prompt).toContain('page state above is refreshed each turn');
        });

        it('should compact page state in output', () => {
            const pageState = {
                items: [1, 2, 3, 4, 5, 6],
                description: 'a'.repeat(300),
            };

            const prompt = buildSystemPrompt(pageState, '');

            // Array should be truncated
            expect(prompt).toContain('(6 total)');
            // String should be truncated
            expect(prompt).not.toContain('a'.repeat(300));
        });
    });
});
