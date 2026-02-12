import { describe, it, expect } from 'vitest';
import { makeViewStateResource, makeInteractionsResource } from '../lib/resources';
import { createMockAutomation, cartInteractions } from './helpers';

describe('Resources', () => {
    describe('state://viewstate', () => {
        it('should return current viewState as JSON', () => {
            const viewState = { items: [{ id: '1', name: 'Mouse' }], total: 29.99 };
            const automation = createMockAutomation({ viewState });
            const resource = makeViewStateResource(automation);

            const result = resource.read();

            expect(resource.uri).toBe('state://viewstate');
            expect(result.contents[0].uri).toBe('state://viewstate');
            expect(result.contents[0].mimeType).toBe('application/json');

            const parsed = JSON.parse(result.contents[0].text!);
            expect(parsed.total).toBe(29.99);
            expect(parsed.items[0].name).toBe('Mouse');
        });
    });

    describe('state://interactions', () => {
        it('should return grouped interactions with serialized fields', () => {
            const interactions = cartInteractions();
            const automation = createMockAutomation({ interactions });
            const resource = makeInteractionsResource(automation);

            const result = resource.read();

            expect(resource.uri).toBe('state://interactions');
            const parsed = JSON.parse(result.contents[0].text!);
            expect(parsed).toHaveLength(6); // 6 groups

            // Check grouped structure with serialized fields
            expect(parsed[0].refName).toBe('decreaseBtn');
            expect(parsed[0].items).toHaveLength(2);
            expect(parsed[0].items[0].coordinate).toBe('item-1/decreaseBtn');
            expect(parsed[0].items[0].elementType).toBe('HTMLButtonElement');
            expect(parsed[0].items[0].events).toEqual(['click']);

            // Should NOT contain raw DOM elements
            expect(parsed[0].items[0].element).toBeUndefined();

            // Simple element
            const addBtn = parsed.find((g: any) => g.refName === 'addBtn');
            expect(addBtn).toBeDefined();
            expect(addBtn.items[0].coordinate).toBe('addBtn');
        });
    });
});
