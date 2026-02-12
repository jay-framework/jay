import { describe, it, expect, vi } from 'vitest';
import {
    makeGetPageStateTool,
    makeListInteractionsTool,
    makeTriggerInteractionTool,
    makeFillInputTool,
} from '../lib/generic-tools';
import { createMockAutomation, cartInteractions } from './helpers';
import type { Interaction } from '@jay-framework/runtime-automation';

const MOCK_AGENT = { requestUserInteraction: vi.fn() };

describe('Generic Tools', () => {
    describe('get-page-state', () => {
        it('should return current viewState', () => {
            const automation = createMockAutomation({
                viewState: { items: [{ id: 'item-1' }], total: 29.99 },
            });
            const tool = makeGetPageStateTool(automation);

            const result = tool.execute({}, MOCK_AGENT);

            expect(result.content[0].text).toContain('"total": 29.99');
            expect(result.content[0].text).toContain('"item-1"');
        });

        it('should have correct name and description', () => {
            const automation = createMockAutomation();
            const tool = makeGetPageStateTool(automation);

            expect(tool.name).toBe('get-page-state');
            expect(tool.description).toContain('page state');
        });

        it('should explain how coordinates map to ViewState arrays', () => {
            const automation = createMockAutomation();
            const tool = makeGetPageStateTool(automation);

            expect(tool.description).toContain('trackBy');
            expect(tool.description).toContain('coordinate');
        });
    });

    describe('list-interactions', () => {
        it('should return grouped interactions with string coordinates and elementType', () => {
            const interactions = cartInteractions();
            const automation = createMockAutomation({ interactions });
            const tool = makeListInteractionsTool(automation);

            const result = tool.execute({}, MOCK_AGENT);
            const text = result.content[0].text!;

            // Should contain grouped structure with serialized fields
            expect(text).toContain('"refName": "removeBtn"');
            expect(text).toContain('"item-1/removeBtn"');
            expect(text).toContain('"elementType": "HTMLButtonElement"');
            expect(text).toContain('"addBtn"');
            // Should NOT contain raw DOM element references
            expect(text).not.toContain('[object HTML');
        });

        it('should explain coordinate format in description', () => {
            const automation = createMockAutomation();
            const tool = makeListInteractionsTool(automation);

            expect(tool.description).toContain('coordinate');
            expect(tool.description).toContain('Multi-segment');
        });
    });

    describe('trigger-interaction', () => {
        it('should trigger click on a simple coordinate', () => {
            const automation = createMockAutomation({
                viewState: { count: 1 },
                interactions: cartInteractions(),
            });
            const tool = makeTriggerInteractionTool(automation);

            const result = tool.execute({ coordinate: 'addBtn' }, MOCK_AGENT);

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['addBtn']);
            expect(result.isError).toBeUndefined();
        });

        it('should trigger click on a forEach coordinate', () => {
            const automation = createMockAutomation({
                interactions: cartInteractions(),
            });
            const tool = makeTriggerInteractionTool(automation);

            tool.execute({ coordinate: 'item-1/removeBtn' }, MOCK_AGENT);

            expect(automation.triggerEvent).toHaveBeenCalledWith('click', ['item-1', 'removeBtn']);
        });

        it('should support custom event type', () => {
            const automation = createMockAutomation();
            const tool = makeTriggerInteractionTool(automation);

            tool.execute({ coordinate: 'myInput', event: 'input' }, MOCK_AGENT);

            expect(automation.triggerEvent).toHaveBeenCalledWith('input', ['myInput']);
        });

        it('should return error when element not found', () => {
            const automation = createMockAutomation();
            (automation.triggerEvent as any).mockImplementation(() => {
                throw new Error('No element found at coordinate: bad/coord');
            });
            const tool = makeTriggerInteractionTool(automation);

            const result = tool.execute({ coordinate: 'bad/coord' }, MOCK_AGENT);

            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('No element found');
        });
    });

    describe('fill-input', () => {
        it('should set value and trigger input event', () => {
            const mockElement = document.createElement('input');
            const interactions: Interaction[] = [
                { refName: 'nameInput', items: [{ coordinate: ['nameInput'], element: mockElement, events: ['input', 'change'] }] },
            ];
            const automation = createMockAutomation({ interactions });
            const tool = makeFillInputTool(automation);

            const result = tool.execute({ coordinate: 'nameInput', value: 'Test' }, MOCK_AGENT);

            expect(mockElement.value).toBe('Test');
            expect(automation.triggerEvent).toHaveBeenCalledWith('input', ['nameInput']);
            expect(result.isError).toBeUndefined();
        });

        it('should trigger change event for select elements', () => {
            const mockElement = document.createElement('select');
            const interactions: Interaction[] = [
                { refName: 'sizeSelect', items: [{ coordinate: ['sizeSelect'], element: mockElement, events: ['change'] }] },
            ];
            const automation = createMockAutomation({ interactions });
            const tool = makeFillInputTool(automation);

            tool.execute({ coordinate: 'sizeSelect', value: 'large' }, MOCK_AGENT);

            expect(automation.triggerEvent).toHaveBeenCalledWith('change', ['sizeSelect']);
        });

        it('should return error for unknown coordinate', () => {
            const automation = createMockAutomation();
            (automation.getInteraction as any).mockReturnValue(undefined);
            const tool = makeFillInputTool(automation);

            const result = tool.execute({ coordinate: 'unknown', value: 'x' }, MOCK_AGENT);

            expect(result.isError).toBe(true);
        });
    });
});
