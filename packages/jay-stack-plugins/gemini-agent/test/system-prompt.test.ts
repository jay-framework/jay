import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../lib/system-prompt';

describe('system-prompt', () => {
    it('should include page state as JSON context', () => {
        const pageState = { viewState: { title: 'Test' }, interactions: [] };

        const prompt = buildSystemPrompt(pageState, []);

        expect(prompt).toContain('"title": "Test"');
        expect(prompt).toContain('## Current Page State');
    });

    it('should include server actions with descriptions', () => {
        const actions = [
            { name: 'searchProducts', description: 'Search for products' },
            { name: 'getCart' },
        ];

        const prompt = buildSystemPrompt({}, actions);

        expect(prompt).toContain('## Available Server Actions');
        expect(prompt).toContain('- searchProducts: Search for products');
        expect(prompt).toContain('- getCart');
    });

    it('should omit server actions section when no actions', () => {
        const prompt = buildSystemPrompt({}, []);

        expect(prompt).not.toContain('## Available Server Actions');
    });

    it('should use custom prefix when provided', () => {
        const prompt = buildSystemPrompt({}, [], 'You are a shopping assistant.');

        expect(prompt).toContain('You are a shopping assistant.');
        expect(prompt).not.toContain('You are a helpful assistant');
    });

    it('should use default prefix when no custom prefix', () => {
        const prompt = buildSystemPrompt({}, []);

        expect(prompt).toContain('You are a helpful assistant for this web application.');
    });

    it('should include tool usage instructions', () => {
        const prompt = buildSystemPrompt({}, []);

        expect(prompt).toContain('Use the provided tools');
        expect(prompt).toContain('page state above is refreshed each turn');
    });
});
