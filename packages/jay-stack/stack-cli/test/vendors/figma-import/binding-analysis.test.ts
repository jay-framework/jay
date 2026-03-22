import { describe, expect, it } from 'vitest';
import { analyzeBindings, validateBindings } from '../../../lib/vendors/figma/binding-analysis';
import type { ConversionContext, LayerBinding } from '../../../lib/vendors/figma/types';

/**
 * Regression (store-light products / product-search): GROUP `productSearch.searchResults.productLink`
 * carries multiple bindings — interactive `productLink`, text `name`, and `href` on `productUrl`.
 * Export must not treat interactive + attribute as invalid when they are different tag paths on one node.
 */
describe('analyzeBindings', () => {
    it('allows interactive ref with href from another tag on the same Figma node', () => {
        const bindings: LayerBinding[] = [
            {
                pageContractPath: { pageUrl: '/products' },
                jayPageSectionId: 's1',
                tagPath: ['productSearch', 'searchResults', 'productLink'],
            },
            {
                pageContractPath: { pageUrl: '/products' },
                jayPageSectionId: 's1',
                tagPath: ['productSearch', 'searchResults', 'name'],
            },
            {
                pageContractPath: { pageUrl: '/products' },
                jayPageSectionId: 's1',
                tagPath: ['productSearch', 'searchResults', 'productUrl'],
                attribute: 'href',
            },
        ];

        const context: ConversionContext = {
            repeaterPathStack: [['productSearch', 'searchResults']],
            indentLevel: 0,
            fontFamilies: new Set(),
            projectPage: {
                url: '/products',
                contract: {
                    tags: [
                        {
                            tag: 'productSearch',
                            tags: [
                                {
                                    tag: 'searchResults',
                                    tags: [
                                        { tag: 'productLink', type: 'interactive' },
                                        { tag: 'name', type: 'data' },
                                        { tag: 'productUrl', type: 'data' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
            plugins: [],
        };

        const analysis = analyzeBindings(bindings, context);
        expect(() =>
            validateBindings(analysis, { name: 'productSearch.searchResults.productLink' } as any),
        ).not.toThrow();
        expect(analysis.type).toBe('attribute');
        expect(analysis.attributes.get('href')).toBe('productUrl');
        expect(analysis.refPath).toBe('productLink');
    });
});
