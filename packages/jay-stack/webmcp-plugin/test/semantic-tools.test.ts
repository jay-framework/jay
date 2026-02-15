import { describe, it, expect, vi } from 'vitest';
import { buildSemanticTools } from '../lib/semantic-tools';
import { createMockAutomation, cartInteractions } from './helpers';
import type { Interaction, InteractionInstance } from '@jay-framework/runtime-automation';

/** Helper to create a quick Interaction group */
function group(refName: string, tag: string, coordOrCoords: string | string[][]): Interaction {
    const coords = typeof coordOrCoords === 'string' ? [[coordOrCoords]] : coordOrCoords;
    return {
        refName,
        items: coords.map((c): InteractionInstance => ({
            coordinate: c,
            element: document.createElement(tag),
            events: tag === 'button' || tag === 'a' ? ['click']
                : tag === 'select' ? ['change']
                : tag === 'input' ? ['input', 'change'] : ['click'],
        })),
    };
}

describe('Semantic Tools', () => {
    it('should build one tool per Interaction group', () => {
        const automation = createMockAutomation({ interactions: cartInteractions() });

        const tools = buildSemanticTools(automation);

        // 3 forEach button groups + 2 input groups + 1 button group = 6
        expect(tools.length).toBe(6);
    });

    it('should name button tools with click- prefix', () => {
        const automation = createMockAutomation({
            interactions: [group('addBtn', 'button', 'addBtn')],
        });

        const tools = buildSemanticTools(automation);

        expect(tools[0].name).toBe('click-add-btn');
    });

    it('should name input tools with fill- prefix', () => {
        const automation = createMockAutomation({
            interactions: [group('nameInput', 'input', 'nameInput')],
        });

        const tools = buildSemanticTools(automation);

        expect(tools[0].name).toBe('fill-name-input');
    });

    it('should add coordinate enum for forEach interactions (multiple items)', () => {
        const automation = createMockAutomation({
            interactions: [group('removeBtn', 'button', [['item-1', 'removeBtn'], ['item-2', 'removeBtn']])],
        });

        const tools = buildSemanticTools(automation);

        const tool = tools[0];
        expect(tool.inputSchema.properties.coordinate).toBeDefined();
        expect(tool.inputSchema.properties.coordinate.enum).toEqual([
            'item-1/removeBtn',
            'item-2/removeBtn',
        ]);
        expect(tool.inputSchema.required).toContain('coordinate');
    });

    it('should add coordinate enum for single item with multi-segment coordinate', () => {
        const automation = createMockAutomation({
            interactions: [group('editBtn', 'button', [['item-1', 'editBtn']])],
        });

        const tools = buildSemanticTools(automation);

        const tool = tools[0];
        expect(tool.inputSchema.properties.coordinate).toBeDefined();
        expect(tool.inputSchema.properties.coordinate.enum).toEqual(['item-1/editBtn']);
    });

    it('should add value param for input tools', () => {
        const automation = createMockAutomation({
            interactions: [group('nameInput', 'input', 'nameInput')],
        });

        const tools = buildSemanticTools(automation);

        const tool = tools[0];
        expect(tool.inputSchema.properties.value).toBeDefined();
        expect(tool.inputSchema.required).toContain('value');
    });

    it('should add enum of option values for select elements', () => {
        const select = document.createElement('select');
        select.innerHTML = '<option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option>';
        const automation = createMockAutomation({
            interactions: [{
                refName: 'sizeSelect',
                items: [{ coordinate: ['sizeSelect'], element: select, events: ['change'] }],
            }],
        });

        const tools = buildSemanticTools(automation);

        const tool = tools[0];
        expect(tool.name).toBe('fill-size-select');
        expect(tool.inputSchema.properties.value.enum).toEqual(['sm', 'md', 'lg']);
        expect(tool.inputSchema.properties.value.description).toBe('Value to select');
    });

    it('should not add enum for regular input elements', () => {
        const automation = createMockAutomation({
            interactions: [group('nameInput', 'input', 'nameInput')],
        });

        const tools = buildSemanticTools(automation);

        expect(tools[0].inputSchema.properties.value.enum).toBeUndefined();
        expect(tools[0].inputSchema.properties.value.description).toBe('Value to set');
    });

    it('should not add value or coordinate for simple buttons', () => {
        const automation = createMockAutomation({
            interactions: [group('submitBtn', 'button', 'submitBtn')],
        });

        const tools = buildSemanticTools(automation);

        const tool = tools[0];
        expect(tool.inputSchema.properties).toEqual({});
        expect(tool.inputSchema.required).toEqual([]);
    });

    it('should use description from Interaction group when available', () => {
        const automation = createMockAutomation({
            interactions: [{
                ...group('addToCart', 'button', 'addToCart'),
                description: 'Add the product to cart',
            }],
        });

        const tools = buildSemanticTools(automation);

        expect(tools[0].description).toBe('Add the product to cart');
    });

    describe('tool execution', () => {
        it('should trigger click for button tools', () => {
            const automation = createMockAutomation({
                interactions: [group('addBtn', 'button', 'addBtn')],
            });

            const tools = buildSemanticTools(automation);
            tools[0].execute({}, { requestUserInteraction: vi.fn() });

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['addBtn']);
        });

        it('should trigger click with parsed coordinate for forEach button', () => {
            const automation = createMockAutomation({
                interactions: [group('removeBtn', 'button', [['item-1', 'removeBtn']])],
            });

            const tools = buildSemanticTools(automation);
            tools[0].execute({ coordinate: 'item-1/removeBtn' }, { requestUserInteraction: vi.fn() });

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['item-1', 'removeBtn']);
        });

        it('should set value and trigger input for fill tools', () => {
            const mockElement = document.createElement('input');
            const interactions: Interaction[] = [{
                refName: 'nameInput',
                items: [{ coordinate: ['nameInput'], element: mockElement, events: ['input', 'change'] }],
            }];
            const automation = createMockAutomation({ interactions });

            const tools = buildSemanticTools(automation);
            tools[0].execute({ value: 'Laptop' }, { requestUserInteraction: vi.fn() });

            expect(mockElement.value).toBe('Laptop');
            expect(automation.triggerEvent).toHaveBeenCalledWith('input', ['nameInput']);
        });
    });

    it('should convert camelCase to kebab-case for tool names', () => {
        const automation = createMockAutomation({
            interactions: [
                group('addToCartBtn', 'button', 'addToCartBtn'),
                group('searchQueryInput', 'input', 'searchQueryInput'),
            ],
        });

        const tools = buildSemanticTools(automation);
        const names = tools.map((t) => t.name);

        expect(names).toContain('click-add-to-cart-btn');
        expect(names).toContain('fill-search-query-input');
    });
});
