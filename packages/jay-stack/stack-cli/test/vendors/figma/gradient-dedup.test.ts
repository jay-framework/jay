import { describe, it, expect } from 'vitest';
import { resolveStyle } from '../../../lib/vendors/figma/style-resolver';
import type { CssClassMap } from '../../../lib/vendors/figma/style-resolver';
import type { ComputedStyleData } from '../../../lib/vendors/figma/computed-style-types';

/**
 * Bug: Export corrupts gradient background layers (Issue #13)
 * Found in: T7 Scenario 6, Step 9 — hero-banner gradient corrupted after roundtrip
 * Expected: Single gradient fill after resolveStyle (not 2+ duplicated fills)
 * Actual: Both `background` (shorthand) and `background-image` (longhand) independently
 *         pushed gradient fills, resulting in duplication
 */
describe('Issue #13: gradient deduplication in resolveStyle', () => {
    const cssClassMap: CssClassMap = new Map([
        [
            'hero-banner',
            {
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                padding: '40px',
            },
        ],
    ]);

    it('should produce exactly 1 gradient fill when class has background shorthand and enricher provides background-image longhand', () => {
        // Class provides: background: linear-gradient(...)
        // Inline provides: background-color: #a9ecff; opacity: 0.9
        // Enricher provides: background-image: linear-gradient(...) (resolved longhand)
        const enrichedStyles: ComputedStyleData = {
            styles: {
                'background-image':
                    'linear-gradient(135deg, rgb(102, 126, 234) 0%, rgb(118, 75, 162) 100%)',
                'background-color': 'rgb(169, 236, 255)',
            },
            classOnlyStyles: {},
        };

        const result = resolveStyle(
            'background-color: #a9ecff; opacity: 0.9',
            ['hero-banner'],
            cssClassMap,
            enrichedStyles,
        );

        // Should have exactly 1 gradient fill (from background-image longhand, not both)
        expect(result.style.fills).toBeDefined();
        expect(result.style.fills!.length).toBe(1);
        expect(result.style.fills![0].type).toBe('GRADIENT_LINEAR');
    });

    it('should not duplicate gradient when background and background-image both resolve to the same gradient', () => {
        // Simulate: class provides background shorthand, enricher provides matching longhand
        const enrichedStyles: ComputedStyleData = {
            styles: {
                'background-image':
                    'linear-gradient(135deg, rgb(102, 126, 234) 0%, rgb(118, 75, 162) 100%)',
            },
            classOnlyStyles: {},
        };

        const result = resolveStyle('', ['hero-banner'], cssClassMap, enrichedStyles);

        expect(result.style.fills).toBeDefined();
        expect(result.style.fills!.length).toBe(1);
        expect(result.style.fills![0].type).toBe('GRADIENT_LINEAR');
    });

    it('should preserve gradient from background shorthand when no background-image longhand exists', () => {
        // Only class provides background shorthand, no enricher
        const result = resolveStyle('', ['hero-banner'], cssClassMap);

        expect(result.style.fills).toBeDefined();
        expect(result.style.fills!.length).toBe(1);
        expect(result.style.fills![0].type).toBe('GRADIENT_LINEAR');
    });

    it('should preserve background-image longhand gradient when no background shorthand exists', () => {
        // Inline provides background-image directly, no class
        const result = resolveStyle(
            'background-image: linear-gradient(180deg, #ff0000 0%, #0000ff 100%)',
        );

        expect(result.style.fills).toBeDefined();
        expect(result.style.fills!.length).toBe(1);
        expect(result.style.fills![0].type).toBe('GRADIENT_LINEAR');
    });

    it('should preserve backgroundColor when no gradient fills exist', () => {
        // Inline provides only background-color, no gradients
        const result = resolveStyle('background-color: #a9ecff');

        expect(result.style.backgroundColor).toBe('#a9ecff');
        expect(result.style.fills).toBeUndefined();
    });

    it('should set backgroundColor from background shorthand when value is a plain color', () => {
        const plainColorClassMap: CssClassMap = new Map([['plain-bg', { background: '#ff0000' }]]);

        const result = resolveStyle('', ['plain-bg'], plainColorClassMap);

        expect(result.style.backgroundColor).toBe('#ff0000');
        expect(result.style.fills).toBeUndefined();
    });
});
