import { describe, it, expect } from 'vitest';
import { makePageGuidePrompt } from '../lib/prompts';
import { createMockAutomation, cartInteractions } from './helpers';
import type { Interaction } from '@jay-framework/runtime-automation';

describe('Prompts', () => {
    describe('page-guide', () => {
        it('should return a message with viewState and interactions', () => {
            const automation = createMockAutomation({
                viewState: { total: 99.99, items: [] },
                interactions: cartInteractions(),
            });
            const prompt = makePageGuidePrompt(automation);

            const result = prompt.get();

            expect(result.messages).toHaveLength(1);
            expect(result.messages[0].role).toBe('user');

            const text = result.messages[0].content.text;
            expect(text).toContain('"total": 99.99');
            expect(text).toContain('item-1/decreaseBtn');
            expect(text).toContain('nameInput');
            expect(text).toContain('HTMLButtonElement');
            expect(text).toContain('Coordinates identify interactive elements');
            expect(text).toContain('Use the provided tools');
        });

        it('should use description from Interaction group', () => {
            const interactions: Interaction[] = [{
                refName: 'addToCart',
                description: 'Add product to cart',
                items: [{ coordinate: ['addToCart'], element: document.createElement('button'), events: ['click'] }],
            }];
            const automation = createMockAutomation({ interactions });
            const prompt = makePageGuidePrompt(automation);

            const result = prompt.get();
            const text = result.messages[0].content.text;

            expect(text).toContain('Add product to cart');
        });
    });
});
