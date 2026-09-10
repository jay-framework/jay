import type { ContractProp } from '@jay-framework/compiler-jay-html';
import { describe, expect, it } from 'vitest';
import {
    buildInstanceBindingScope,
    coerceInstancePropValue,
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
                jay: {
                    params: { category: 'bedroom', slug: '8167945' },
                    url: { path: '/kitan/products/bedroom/8167945' },
                },
            });
        });
    });

    describe('coerceInstancePropValue', () => {
        const statusEnum = { name: 'Status', values: ['success', 'warning', 'error'] };

        it('maps an enum member-name string to its numeric value', () => {
            expect(coerceInstancePropValue('warning', statusEnum)).toBe(1);
        });

        it('passes an already-numeric (stringified) enum value through as a number', () => {
            expect(coerceInstancePropValue('2', statusEnum)).toBe(2);
        });

        it('coerces a number dataType', () => {
            expect(coerceInstancePropValue('42', { name: 'number' })).toBe(42);
        });

        it('coerces a boolean dataType (true only for "true")', () => {
            expect(coerceInstancePropValue('true', { name: 'boolean' })).toBe(true);
            expect(coerceInstancePropValue('false', { name: 'boolean' })).toBe(false);
        });

        it('leaves a string dataType unchanged', () => {
            expect(coerceInstancePropValue('bedroom', { name: 'string' })).toBe('bedroom');
        });

        it('leaves an unresolved binding ("") and untyped values untouched', () => {
            expect(coerceInstancePropValue('', { name: 'number' })).toBe('');
            expect(coerceInstancePropValue('7', undefined)).toBe('7');
        });

        it('passes an already-typed object/array binding through unchanged', () => {
            const items = [{ id: 1 }, { id: 2 }];
            expect(coerceInstancePropValue(items, undefined)).toBe(items);
            const obj = { a: 1 };
            expect(coerceInstancePropValue(obj, { name: 'string' })).toBe(obj);
        });

        it('passes an already-typed number/boolean binding through unchanged', () => {
            expect(coerceInstancePropValue(3, { name: 'number' })).toBe(3);
            expect(coerceInstancePropValue(false, { name: 'boolean' })).toBe(false);
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
                limit: 4,
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
