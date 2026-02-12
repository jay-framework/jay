import { describe, it, expect, vi } from 'vitest';
import { registerSemanticTools } from '../lib/semantic-tools';
import { createMockAutomation, createMockModelContext, cartInteractions } from './helpers';
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
    it('should register one tool per Interaction group', () => {
        const interactions = cartInteractions();
        const automation = createMockAutomation({ interactions });
        const mc = createMockModelContext();

        const regs = registerSemanticTools(mc, automation);

        // 3 forEach button groups + 2 input groups + 1 button group = 6
        expect(regs.length).toBe(6);
        expect(mc._tools.size).toBe(6);
    });

    it('should name button tools with click- prefix', () => {
        const automation = createMockAutomation({
            interactions: [group('addBtn', 'button', 'addBtn')],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        expect(mc._tools.has('click-add-btn')).toBe(true);
    });

    it('should name input tools with fill- prefix', () => {
        const automation = createMockAutomation({
            interactions: [group('nameInput', 'input', 'nameInput')],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        expect(mc._tools.has('fill-name-input')).toBe(true);
    });

    it('should add coordinate enum for forEach interactions (multiple items)', () => {
        const automation = createMockAutomation({
            interactions: [group('removeBtn', 'button', [['item-1', 'removeBtn'], ['item-2', 'removeBtn']])],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-remove-btn')!;
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
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-edit-btn')!;
        expect(tool.inputSchema.properties.coordinate).toBeDefined();
        expect(tool.inputSchema.properties.coordinate.enum).toEqual(['item-1/editBtn']);
    });

    it('should add value param for input tools', () => {
        const automation = createMockAutomation({
            interactions: [group('nameInput', 'input', 'nameInput')],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('fill-name-input')!;
        expect(tool.inputSchema.properties.value).toBeDefined();
        expect(tool.inputSchema.required).toContain('value');
    });

    it('should not add value or coordinate for simple buttons', () => {
        const automation = createMockAutomation({
            interactions: [group('submitBtn', 'button', 'submitBtn')],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-submit-btn')!;
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
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-add-to-cart')!;
        expect(tool.description).toBe('Add the product to cart');
    });

    describe('tool execution', () => {
        it('should trigger click for button tools', () => {
            const automation = createMockAutomation({
                interactions: [group('addBtn', 'button', 'addBtn')],
            });
            const mc = createMockModelContext();
            registerSemanticTools(mc, automation);

            const tool = mc._tools.get('click-add-btn')!;
            tool.execute({}, { requestUserInteraction: vi.fn() });

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['addBtn']);
        });

        it('should trigger click with parsed coordinate for forEach button', () => {
            const automation = createMockAutomation({
                interactions: [group('removeBtn', 'button', [['item-1', 'removeBtn']])],
            });
            const mc = createMockModelContext();
            registerSemanticTools(mc, automation);

            const tool = mc._tools.get('click-remove-btn')!;
            tool.execute({ coordinate: 'item-1/removeBtn' }, { requestUserInteraction: vi.fn() });

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['item-1', 'removeBtn']);
        });

        it('should set value and trigger input for fill tools', () => {
            const mockElement = document.createElement('input');
            const interactions: Interaction[] = [{
                refName: 'nameInput',
                items: [{ coordinate: ['nameInput'], element: mockElement, events: ['input', 'change'] }],
            }];
            const automation = createMockAutomation({ interactions });
            const mc = createMockModelContext();
            registerSemanticTools(mc, automation);

            const tool = mc._tools.get('fill-name-input')!;
            tool.execute({ value: 'Laptop' }, { requestUserInteraction: vi.fn() });

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
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        expect(mc._tools.has('click-add-to-cart-btn')).toBe(true);
        expect(mc._tools.has('fill-search-query-input')).toBe(true);
    });

    it('registrations can be unregistered', () => {
        const automation = createMockAutomation({
            interactions: [group('btn', 'button', 'btn')],
        });
        const mc = createMockModelContext();

        const regs = registerSemanticTools(mc, automation);
        expect(mc._tools.size).toBe(1);

        regs.forEach((r) => r.unregister());
        expect(mc._tools.size).toBe(0);
    });
});
