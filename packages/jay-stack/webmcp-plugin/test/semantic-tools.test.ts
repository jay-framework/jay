import { describe, it, expect, vi } from 'vitest';
import { registerSemanticTools } from '../lib/semantic-tools';
import { createMockAutomation, createMockModelContext, cartInteractions } from './helpers';

describe('Semantic Tools', () => {
    it('should register one tool per grouped interaction', () => {
        const interactions = cartInteractions();
        const automation = createMockAutomation({ interactions });
        const mc = createMockModelContext();

        const regs = registerSemanticTools(mc, automation);

        expect(regs.length).toBe(6); // 3 forEach buttons + 2 inputs + 1 button
        expect(mc._tools.size).toBe(6);
    });

    it('should name button tools with click- prefix', () => {
        const automation = createMockAutomation({
            interactions: [{ ref: 'addBtn', type: 'Button', events: ['click'] }],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        expect(mc._tools.has('click-add-btn')).toBe(true);
    });

    it('should name input tools with fill- prefix', () => {
        const automation = createMockAutomation({
            interactions: [{ ref: 'nameInput', type: 'TextInput', events: ['input', 'change'] }],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        expect(mc._tools.has('fill-name-input')).toBe(true);
    });

    it('should add itemId enum for forEach interactions', () => {
        const automation = createMockAutomation({
            interactions: [
                {
                    ref: 'removeBtn',
                    type: 'Button',
                    events: ['click'],
                    inForEach: true,
                    items: [
                        { id: 'item-1', label: 'Mouse' },
                        { id: 'item-2', label: 'Hub' },
                    ],
                },
            ],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-remove-btn')!;
        expect(tool.inputSchema.properties.itemId).toBeDefined();
        expect(tool.inputSchema.properties.itemId.enum).toEqual(['item-1', 'item-2']);
        expect(tool.inputSchema.required).toContain('itemId');
    });

    it('should add value param for input tools', () => {
        const automation = createMockAutomation({
            interactions: [{ ref: 'nameInput', type: 'TextInput', events: ['input', 'change'] }],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('fill-name-input')!;
        expect(tool.inputSchema.properties.value).toBeDefined();
        expect(tool.inputSchema.required).toContain('value');
    });

    it('should not add value or itemId for simple buttons', () => {
        const automation = createMockAutomation({
            interactions: [{ ref: 'submitBtn', type: 'Button', events: ['click'] }],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-submit-btn')!;
        expect(tool.inputSchema.properties).toEqual({});
        expect(tool.inputSchema.required).toEqual([]);
    });

    it('should use description from contract when available', () => {
        const automation = createMockAutomation({
            interactions: [
                { ref: 'addToCart', type: 'Button', events: ['click'], description: 'Add the product to cart' },
            ],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        const tool = mc._tools.get('click-add-to-cart')!;
        expect(tool.description).toBe('Add the product to cart');
    });

    describe('tool execution', () => {
        it('should trigger click for button tools', () => {
            const automation = createMockAutomation({
                interactions: [{ ref: 'addBtn', type: 'Button', events: ['click'] }],
            });
            const mc = createMockModelContext();
            registerSemanticTools(mc, automation);

            const tool = mc._tools.get('click-add-btn')!;
            tool.execute({}, { requestUserInteraction: vi.fn() });

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['addBtn']);
        });

        it('should trigger click with coordinate for forEach button', () => {
            const automation = createMockAutomation({
                interactions: [
                    {
                        ref: 'removeBtn',
                        type: 'Button',
                        events: ['click'],
                        inForEach: true,
                        items: [{ id: 'item-1', label: 'Mouse' }],
                    },
                ],
            });
            const mc = createMockModelContext();
            registerSemanticTools(mc, automation);

            const tool = mc._tools.get('click-remove-btn')!;
            tool.execute({ itemId: 'item-1' }, { requestUserInteraction: vi.fn() });

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['item-1', 'removeBtn']);
        });

        it('should set value and trigger input for fill tools', () => {
            const mockElement = document.createElement('input');
            const automation = createMockAutomation({
                interactions: [{ ref: 'nameInput', type: 'TextInput', events: ['input', 'change'] }],
            });
            (automation.getInteraction as any).mockReturnValue({
                refName: 'nameInput',
                coordinate: ['nameInput'],
                element: mockElement,
                elementType: 'HTMLInputElement',
                supportedEvents: ['input', 'change'],
            });
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
                { ref: 'addToCartBtn', type: 'Button', events: ['click'] },
                { ref: 'searchQueryInput', type: 'TextInput', events: ['input', 'change'] },
            ],
        });
        const mc = createMockModelContext();

        registerSemanticTools(mc, automation);

        expect(mc._tools.has('click-add-to-cart-btn')).toBe(true);
        expect(mc._tools.has('fill-search-query-input')).toBe(true);
    });

    it('registrations can be unregistered', () => {
        const automation = createMockAutomation({
            interactions: [{ ref: 'btn', type: 'Button', events: ['click'] }],
        });
        const mc = createMockModelContext();

        const regs = registerSemanticTools(mc, automation);
        expect(mc._tools.size).toBe(1);

        regs.forEach((r) => r.unregister());
        expect(mc._tools.size).toBe(0);
    });
});
