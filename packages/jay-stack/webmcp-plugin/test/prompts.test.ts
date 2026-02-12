import { describe, it, expect } from 'vitest';
import { makePageGuidePrompt } from '../lib/prompts';
import { createMockAutomation, cartInteractions } from './helpers';

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
            expect(text).toContain('decreaseBtn');
            expect(text).toContain('nameInput');
            expect(text).toContain('forEach');
            expect(text).toContain('Use the provided tools');
        });

        it('should use description from contract', () => {
            const automation = createMockAutomation({
                interactions: [
                    { ref: 'addToCart', type: 'Button', events: ['click'], description: 'Add product to cart' },
                ],
            });
            const prompt = makePageGuidePrompt(automation);

            const result = prompt.get();
            const text = result.messages[0].content.text;

            expect(text).toContain('Add product to cart');
        });
    });
});
