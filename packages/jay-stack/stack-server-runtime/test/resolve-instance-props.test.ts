import type { ContractProp } from '@jay-framework/compiler-jay-html';
import { describe, expect, it } from 'vitest';
import {
    buildInstanceBindingScope,
    normalizeAndResolveInstanceProps,
    resolvePathValue,
    resolvePropBinding,
} from '../lib/resolve-instance-props';

describe('resolve-instance-props', () => {
    describe('resolvePathValue', () => {
        it('resolves nested keyed headless paths', () => {
            const scope = { p: { categorySlug: 'bedroom', _id: 'prod-1' } };
            expect(resolvePathValue(scope, 'p.categorySlug')).toBe('bedroom');
            expect(resolvePathValue(scope, 'p._id')).toBe('prod-1');
        });

        it('returns undefined for missing paths', () => {
            expect(resolvePathValue({ p: {} }, 'p.categorySlug')).toBeUndefined();
        });
    });

    describe('resolvePropBinding', () => {
        it('passes through literal prop values', () => {
            expect(resolvePropBinding('bedroom', {})).toBe('bedroom');
        });

        it('resolves brace bindings from scope', () => {
            const scope = { p: { categorySlug: 'bedroom' } };
            expect(resolvePropBinding('{p.categorySlug}', scope)).toBe('bedroom');
        });

        it('returns empty string when binding path is missing', () => {
            expect(resolvePropBinding('{p.categorySlug}', { p: {} })).toBe('');
        });
    });

    describe('buildInstanceBindingScope', () => {
        it('merges page props, params, and view state with view state winning', () => {
            const scope = buildInstanceBindingScope({
                pageProps: { language: 'he', url: '/kitan/products/bedroom/8167945' },
                pageParams: { category: 'bedroom', slug: '8167945' },
                pageViewState: { p: { categorySlug: 'bedroom' } },
            });
            expect(scope).toEqual({
                language: 'he',
                url: '/kitan/products/bedroom/8167945',
                category: 'bedroom',
                slug: '8167945',
                p: { categorySlug: 'bedroom' },
            });
        });
    });

    describe('normalizeAndResolveInstanceProps', () => {
        const categoryProductsProps = [
            { name: 'productId', dataType: { kind: 'primitive', name: 'string' } },
            { name: 'categorySlug', dataType: { kind: 'primitive', name: 'string' } },
            { name: 'limit', dataType: { kind: 'primitive', name: 'number' } },
        ] as unknown as ContractProp[];

        it('normalizes attribute casing and resolves keyed bindings', () => {
            const props = normalizeAndResolveInstanceProps(
                {
                    productid: '{p._id}',
                    categoryslug: '{p.categorySlug}',
                    limit: '4',
                },
                categoryProductsProps,
                {
                    pageViewState: {
                        p: { _id: 'prod-1', categorySlug: 'bedroom' },
                    },
                },
            );

            expect(props).toEqual({
                productId: 'prod-1',
                categorySlug: 'bedroom',
                limit: '4',
            });
        });

        it('resolves route param bindings like {category}', () => {
            const props = normalizeAndResolveInstanceProps(
                { categorySlug: '{category}' },
                [
                    { name: 'categorySlug', dataType: { kind: 'primitive', name: 'string' } },
                ] as unknown as ContractProp[],
                { pageParams: { category: 'bedroom' } },
            );

            expect(props).toEqual({ categorySlug: 'bedroom' });
        });
    });
});
