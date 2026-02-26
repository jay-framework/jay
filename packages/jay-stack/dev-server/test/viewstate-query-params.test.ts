import { describe, it, expect } from 'vitest';
import {
    extractViewStateParams,
    isPathSafe,
    setNestedValue,
    coerceValue,
    findContractTag,
    applyViewStateOverrides,
} from '../lib/viewstate-query-params';
import { Contract, ContractTag, ContractTagType } from '@jay-framework/compiler-jay-html';
import { JayString, JayNumber, JayBoolean, JayDate, JayEnumType } from '@jay-framework/compiler-shared';

describe('extractViewStateParams', () => {
    it('returns undefined when no vs params present', () => {
        const query = { foo: 'bar', baz: 'qux' };
        expect(extractViewStateParams(query)).toBeUndefined();
    });

    it('extracts only vs params and strips prefix', () => {
        const query = { 'vs.title': 'Hello', 'vs.price': '42', foo: 'bar' };
        expect(extractViewStateParams(query)).toEqual({ title: 'Hello', price: '42' });
    });

    it('handles repeated params with last wins', () => {
        const query = { 'vs.title': ['First', 'Second', 'Third'] };
        expect(extractViewStateParams(query)).toEqual({ title: 'Third' });
    });

    it('handles array values by taking last element', () => {
        const query = { 'vs.name': ['A', 'B', 'C'], 'vs.age': '30' };
        expect(extractViewStateParams(query)).toEqual({ name: 'C', age: '30' });
    });

    it('handles mixed vs and non-vs params', () => {
        const query = {
            foo: 'bar',
            'vs.title': 'Test',
            'vs.price': '99',
            other: 'value',
        };
        expect(extractViewStateParams(query)).toEqual({ title: 'Test', price: '99' });
    });
});

describe('isPathSafe', () => {
    it('returns true for normal paths', () => {
        expect(isPathSafe(['foo', 'bar', 'baz'])).toBe(true);
        expect(isPathSafe(['product', 'name'])).toBe(true);
        expect(isPathSafe(['items', '0', 'title'])).toBe(true);
    });

    it('returns false for __proto__', () => {
        expect(isPathSafe(['__proto__'])).toBe(false);
        expect(isPathSafe(['foo', '__proto__', 'bar'])).toBe(false);
    });

    it('returns false for constructor', () => {
        expect(isPathSafe(['constructor'])).toBe(false);
        expect(isPathSafe(['foo', 'constructor'])).toBe(false);
    });

    it('returns false for prototype', () => {
        expect(isPathSafe(['prototype'])).toBe(false);
        expect(isPathSafe(['bar', 'prototype', 'baz'])).toBe(false);
    });

    it('returns false for nested blocked segment', () => {
        expect(isPathSafe(['normal', 'path', '__proto__', 'evil'])).toBe(false);
    });
});

describe('setNestedValue', () => {
    it('sets flat key', () => {
        const obj: any = {};
        setNestedValue(obj, ['title'], 'Hello');
        expect(obj).toEqual({ title: 'Hello' });
    });

    it('sets nested key', () => {
        const obj: any = {};
        setNestedValue(obj, ['product', 'name'], 'Widget');
        expect(obj).toEqual({ product: { name: 'Widget' } });
    });

    it('auto-creates intermediate objects', () => {
        const obj: any = {};
        setNestedValue(obj, ['a', 'b', 'c'], 'value');
        expect(obj).toEqual({ a: { b: { c: 'value' } } });
    });

    it('creates array for numeric index', () => {
        const obj: any = {};
        setNestedValue(obj, ['items', '0'], 'first');
        expect(obj).toEqual({ items: ['first'] });
    });

    it('fills array holes with empty objects', () => {
        const obj: any = {};
        setNestedValue(obj, ['items', '2'], 'third');
        expect(obj.items).toHaveLength(3);
        expect(obj.items[0]).toEqual({});
        expect(obj.items[1]).toEqual({});
        expect(obj.items[2]).toBe('third');
    });

    it('sets deeply nested with arrays', () => {
        const obj: any = {};
        setNestedValue(obj, ['products', '0', 'name'], 'Shirt');
        setNestedValue(obj, ['products', '0', 'price'], 25);
        setNestedValue(obj, ['products', '1', 'name'], 'Pants');
        expect(obj).toEqual({
            products: [
                { name: 'Shirt', price: 25 },
                { name: 'Pants' },
            ],
        });
    });

    it('overwrites existing values', () => {
        const obj: any = { title: 'Old' };
        setNestedValue(obj, ['title'], 'New');
        expect(obj).toEqual({ title: 'New' });
    });
});

describe('coerceValue', () => {
    it('returns string as-is when no tag provided', () => {
        const result = coerceValue('hello', undefined);
        expect(result).toEqual({ value: 'hello', ok: true });
    });

    it('returns string for string type', () => {
        const tag: ContractTag = { tag: 'title', type: [ContractTagType.data], dataType: JayString };
        const result = coerceValue('Hello', tag);
        expect(result).toEqual({ value: 'Hello', ok: true });
    });

    it('coerces valid number', () => {
        const tag: ContractTag = { tag: 'price', type: [ContractTagType.data], dataType: JayNumber };
        const result = coerceValue('42.5', tag);
        expect(result).toEqual({ value: 42.5, ok: true });
    });

    it('fails on invalid number', () => {
        const tag: ContractTag = { tag: 'price', type: [ContractTagType.data], dataType: JayNumber };
        const result = coerceValue('not-a-number', tag);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ ok: false });
        if ('reason' in result) {
            expect(result.reason).toContain('not a valid number');
        }
    });

    it('coerces true for boolean', () => {
        const tag: ContractTag = { tag: 'inStock', type: [ContractTagType.data], dataType: JayBoolean };
        const result = coerceValue('true', tag);
        expect(result).toEqual({ value: true, ok: true });
    });

    it('coerces false for boolean', () => {
        const tag: ContractTag = { tag: 'inStock', type: [ContractTagType.data], dataType: JayBoolean };
        const result = coerceValue('false', tag);
        expect(result).toEqual({ value: false, ok: true });
    });

    it('fails on invalid boolean', () => {
        const tag: ContractTag = { tag: 'inStock', type: [ContractTagType.data], dataType: JayBoolean };
        const result = coerceValue('tru', tag);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ ok: false });
        if ('reason' in result) {
            expect(result.reason).toContain('not a valid boolean');
        }
    });

    it('coerces valid date to ISO string', () => {
        const tag: ContractTag = { tag: 'created', type: [ContractTagType.data], dataType: JayDate };
        const result = coerceValue('2024-01-15', tag);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toBe('2024-01-15T00:00:00.000Z');
        }
    });

    it('fails on invalid date', () => {
        const tag: ContractTag = { tag: 'created', type: [ContractTagType.data], dataType: JayDate };
        const result = coerceValue('not-a-date', tag);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ ok: false });
        if ('reason' in result) {
            expect(result.reason).toContain('not a valid date');
        }
    });

    it('coerces enum by name to index', () => {
        const enumType = new JayEnumType('ProductType', ['digital', 'physical']);
        const tag: ContractTag = { tag: 'productType', type: [ContractTagType.variant], dataType: enumType };
        const result = coerceValue('physical', tag);
        expect(result).toEqual({ value: 1, ok: true });
    });

    it('coerces enum by valid index', () => {
        const enumType = new JayEnumType('ProductType', ['digital', 'physical']);
        const tag: ContractTag = { tag: 'productType', type: [ContractTagType.variant], dataType: enumType };
        const result = coerceValue('0', tag);
        expect(result).toEqual({ value: 0, ok: true });
    });

    it('fails on invalid enum name', () => {
        const enumType = new JayEnumType('ProductType', ['digital', 'physical']);
        const tag: ContractTag = { tag: 'productType', type: [ContractTagType.variant], dataType: enumType };
        const result = coerceValue('unknown', tag);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ ok: false });
        if ('reason' in result) {
            expect(result.reason).toContain('not a valid enum value');
        }
    });

    it('fails on enum out of range', () => {
        const enumType = new JayEnumType('ProductType', ['digital', 'physical']);
        const tag: ContractTag = { tag: 'productType', type: [ContractTagType.variant], dataType: enumType };
        const result = coerceValue('5', tag);
        expect(result.ok).toBe(false);
    });

    it('fails on enum non-integer', () => {
        const enumType = new JayEnumType('ProductType', ['digital', 'physical']);
        const tag: ContractTag = { tag: 'productType', type: [ContractTagType.variant], dataType: enumType };
        const result = coerceValue('1.5', tag);
        expect(result.ok).toBe(false);
    });

    it('fails on enum negative index', () => {
        const enumType = new JayEnumType('ProductType', ['digital', 'physical']);
        const tag: ContractTag = { tag: 'productType', type: [ContractTagType.variant], dataType: enumType };
        const result = coerceValue('-1', tag);
        expect(result.ok).toBe(false);
    });

    it('parses JSON array', () => {
        const result = coerceValue('[1,2,3]', undefined);
        expect(result).toEqual({ value: [1, 2, 3], ok: true });
    });

    it('parses JSON object', () => {
        const result = coerceValue('{"name":"Test","price":42}', undefined);
        expect(result).toEqual({ value: { name: 'Test', price: 42 }, ok: true });
    });

    it('fails on invalid JSON', () => {
        const result = coerceValue('[invalid', undefined);
        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ ok: false });
        if ('reason' in result) {
            expect(result.reason).toContain('invalid JSON');
        }
    });
});

describe('findContractTag', () => {
    it('finds direct tag match in page contract', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                { tag: 'title', type: [ContractTagType.data], dataType: JayString },
                { tag: 'price', type: [ContractTagType.data], dataType: JayNumber },
            ],
        };
        const tag = findContractTag(['title'], contract);
        expect(tag?.tag).toBe('title');
    });

    it('finds camelCase match for hyphenated tag', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                { tag: 'product-type', type: [ContractTagType.variant], dataType: JayString },
            ],
        };
        const tag = findContractTag(['productType'], contract);
        expect(tag?.tag).toBe('product-type');
    });

    it('finds nested tags', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                {
                    tag: 'product',
                    type: [ContractTagType.subContract],
                    tags: [
                        { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'price', type: [ContractTagType.data], dataType: JayNumber },
                    ],
                },
            ],
        };
        const tag = findContractTag(['product', 'name'], contract);
        expect(tag?.tag).toBe('name');
    });

    it('finds headless key match', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [{ tag: 'title', type: [ContractTagType.data], dataType: JayString }],
        };
        const headlessContracts = [
            {
                key: 'product',
                contract: {
                    name: 'ProductContract',
                    tags: [
                        { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                        { tag: 'price', type: [ContractTagType.data], dataType: JayNumber },
                    ],
                },
            },
        ];
        const tag = findContractTag(['product', 'name'], contract, headlessContracts);
        expect(tag?.tag).toBe('name');
    });

    it('skips numeric segment into sub-contract', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                {
                    tag: 'products',
                    type: [ContractTagType.subContract],
                    repeated: true,
                    tags: [
                        { tag: 'name', type: [ContractTagType.data], dataType: JayString },
                    ],
                },
            ],
        };
        const tag = findContractTag(['products', '0', 'name'], contract);
        expect(tag?.tag).toBe('name');
    });

    it('returns undefined for missing path', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                { tag: 'title', type: [ContractTagType.data], dataType: JayString },
            ],
        };
        const tag = findContractTag(['nonexistent'], contract);
        expect(tag).toBeUndefined();
    });

    it('returns undefined for empty path', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [],
        };
        const tag = findContractTag([], contract);
        expect(tag).toBeUndefined();
    });
});

describe('applyViewStateOverrides', () => {
    it('applies string override', () => {
        const viewState = { title: 'Original' };
        const overrides = { title: 'Overridden' };
        const result = applyViewStateOverrides(viewState, overrides);
        expect(result).toEqual({ title: 'Overridden' });
    });

    it('applies type-coerced override', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                { tag: 'price', type: [ContractTagType.data], dataType: JayNumber },
                { tag: 'inStock', type: [ContractTagType.data], dataType: JayBoolean },
            ],
        };
        const viewState = { price: 100, inStock: true };
        const overrides = { price: '42.5', inStock: 'false' };
        const result = applyViewStateOverrides(viewState, overrides, contract);
        expect(result).toEqual({ price: 42.5, inStock: false });
    });

    it('preserves original value on failed coercion', () => {
        const contract: Contract = {
            name: 'TestPage',
            tags: [
                { tag: 'price', type: [ContractTagType.data], dataType: JayNumber },
            ],
        };
        const viewState = { price: 100, title: 'Product' };
        const overrides = { price: 'not-a-number', title: 'Updated' };
        const result = applyViewStateOverrides(viewState, overrides, contract);
        expect(result).toEqual({ price: 100, title: 'Updated' });
    });

    it('skips blocked path', () => {
        const viewState = { title: 'Safe' };
        const overrides = { '__proto__': 'evil' };
        const result = applyViewStateOverrides(viewState, overrides);
        expect(result).toEqual({ title: 'Safe' });
        expect(result).not.toHaveProperty('__proto__');
    });

    it('applies JSON then dot-path with correct precedence', () => {
        const viewState = { products: [] };
        const overrides = {
            products: '[{"name":"A","price":10},{"name":"B","price":20}]',
            'products.0.name': 'Modified A',
        };
        const result = applyViewStateOverrides(viewState, overrides);
        expect(result).toEqual({
            products: [
                { name: 'Modified A', price: 10 },
                { name: 'B', price: 20 },
            ],
        });
    });

    it('applies nested overrides', () => {
        const viewState = { product: { name: 'Original', price: 100 } };
        const overrides = { 'product.name': 'Updated', 'product.price': '50' };
        const result = applyViewStateOverrides(viewState, overrides);
        expect(result).toEqual({ product: { name: 'Updated', price: '50' } });
    });

    it('does not mutate original viewState', () => {
        const viewState = { title: 'Original' };
        const overrides = { title: 'Changed' };
        applyViewStateOverrides(viewState, overrides);
        expect(viewState).toEqual({ title: 'Original' });
    });

    it('creates array from empty state', () => {
        const viewState = {};
        const overrides = {
            'items.0.name': 'First',
            'items.1.name': 'Second',
        };
        const result = applyViewStateOverrides(viewState, overrides);
        expect(result).toEqual({
            items: [
                { name: 'First' },
                { name: 'Second' },
            ],
        });
    });
});
