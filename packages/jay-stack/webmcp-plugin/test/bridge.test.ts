import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupWebMCP } from '../lib/webmcp-bridge';
import { createMockAutomation, createMockModelContext, cartInteractions } from './helpers';
import type { ModelContextContainer } from '../lib/webmcp-types';

describe('WebMCP Bridge', () => {
    let originalModelContext: ModelContextContainer | undefined;

    beforeEach(() => {
        originalModelContext = navigator.modelContext;
    });

    afterEach(() => {
        (navigator as any).modelContext = originalModelContext;
    });

    it('should gracefully no-op when navigator.modelContext is absent', () => {
        (navigator as any).modelContext = undefined;
        const automation = createMockAutomation();

        const cleanup = setupWebMCP(automation);

        expect(cleanup).toBeInstanceOf(Function);
        cleanup(); // should not throw
    });

    it('should register generic tools, resources, and prompts', () => {
        const mc = createMockModelContext();
        (navigator as any).modelContext = mc;
        const automation = createMockAutomation({
            interactions: [{ ref: 'btn', type: 'Button', events: ['click'] }],
        });

        setupWebMCP(automation);

        // 4 generic + 1 semantic
        expect(mc._tools.has('get-page-state')).toBe(true);
        expect(mc._tools.has('list-interactions')).toBe(true);
        expect(mc._tools.has('trigger-interaction')).toBe(true);
        expect(mc._tools.has('fill-input')).toBe(true);
        expect(mc._tools.has('click-btn')).toBe(true);

        // 2 resources
        expect(mc._resources.has('state://viewstate')).toBe(true);
        expect(mc._resources.has('state://interactions')).toBe(true);

        // 1 prompt
        expect(mc._prompts.has('page-guide')).toBe(true);
    });

    it('should register semantic tools from cart interactions', () => {
        const mc = createMockModelContext();
        (navigator as any).modelContext = mc;
        const automation = createMockAutomation({ interactions: cartInteractions() });

        setupWebMCP(automation);

        // 4 generic + 6 semantic = 10
        expect(mc._tools.size).toBe(10);
        expect(mc._tools.has('click-decrease-btn')).toBe(true);
        expect(mc._tools.has('click-increase-btn')).toBe(true);
        expect(mc._tools.has('click-remove-btn')).toBe(true);
        expect(mc._tools.has('fill-name-input')).toBe(true);
        expect(mc._tools.has('fill-price-input')).toBe(true);
        expect(mc._tools.has('click-add-btn')).toBe(true);
    });

    it('should cleanup all registrations', () => {
        const mc = createMockModelContext();
        (navigator as any).modelContext = mc;
        const automation = createMockAutomation({
            interactions: [{ ref: 'btn', type: 'Button', events: ['click'] }],
        });

        const cleanup = setupWebMCP(automation);
        expect(mc._tools.size).toBe(5); // 4 generic + 1 semantic

        cleanup();
        expect(mc._tools.size).toBe(0);
        expect(mc._resources.size).toBe(0);
        expect(mc._prompts.size).toBe(0);
    });

    it('should regenerate semantic tools when interactions change', () => {
        const mc = createMockModelContext();
        (navigator as any).modelContext = mc;

        // Start with 2 items
        const interactions = [
            {
                ref: 'removeBtn',
                type: 'Button' as const,
                events: ['click'],
                inForEach: true as const,
                items: [
                    { id: 'item-1', label: 'Mouse' },
                    { id: 'item-2', label: 'Hub' },
                ],
            },
        ];
        const automation = createMockAutomation({ interactions });

        setupWebMCP(automation);

        const tool1 = mc._tools.get('click-remove-btn')!;
        expect(tool1.inputSchema.properties.itemId.enum).toEqual(['item-1', 'item-2']);

        // Simulate adding item-3
        interactions[0].items!.push({ id: 'item-3', label: 'Keyboard' });
        (automation as any)._notifyStateChange();

        const tool2 = mc._tools.get('click-remove-btn')!;
        expect(tool2.inputSchema.properties.itemId.enum).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it('should not regenerate semantic tools when only viewState changes', () => {
        const mc = createMockModelContext();
        (navigator as any).modelContext = mc;

        const automation = createMockAutomation({
            interactions: [{ ref: 'btn', type: 'Button', events: ['click'] }],
        });

        setupWebMCP(automation);

        // Track registerTool call count
        const callCount = (mc.registerTool as any).mock.calls.length;

        // Trigger state change but interactions haven't changed
        (automation as any)._notifyStateChange();

        // No new registerTool calls
        expect((mc.registerTool as any).mock.calls.length).toBe(callCount);
    });
});
