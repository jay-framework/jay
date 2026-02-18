import { describe, it, expect } from 'vitest';
import { tokenizeCondition } from '../../../lib/vendors/figma/condition-tokenizer';

describe('condition-tokenizer', () => {
    it('simple boolean: "isAvailable"', () => {
        expect(tokenizeCondition('isAvailable')).toEqual([
            {
                path: ['isAvailable'],
                isNegated: false,
                isComputed: false,
                rawExpression: 'isAvailable',
            },
        ]);
    });

    it('negated boolean: "!isAvailable"', () => {
        expect(tokenizeCondition('!isAvailable')).toEqual([
            {
                path: ['isAvailable'],
                isNegated: true,
                isComputed: false,
                rawExpression: '!isAvailable',
            },
        ]);
    });

    it('enum equality: "mediaType == IMAGE"', () => {
        expect(tokenizeCondition('mediaType == IMAGE')).toEqual([
            {
                path: ['mediaType'],
                operator: '==',
                comparedValue: 'IMAGE',
                isNegated: false,
                isComputed: false,
                rawExpression: 'mediaType == IMAGE',
            },
        ]);
    });

    it('dotted path: "productPage.mediaType == VIDEO"', () => {
        expect(tokenizeCondition('productPage.mediaType == VIDEO')).toEqual([
            {
                path: ['productPage', 'mediaType'],
                operator: '==',
                comparedValue: 'VIDEO',
                isNegated: false,
                isComputed: false,
                rawExpression: 'productPage.mediaType == VIDEO',
            },
        ]);
    });

    it('numeric comparison (simple): "count > 0"', () => {
        expect(tokenizeCondition('count > 0')).toEqual([
            {
                path: ['count'],
                operator: '>',
                comparedValue: '0',
                isNegated: false,
                isComputed: false,
                rawExpression: 'count > 0',
            },
        ]);
    });

    it('compound AND: "a == X && b == Y"', () => {
        const result = tokenizeCondition('a == X && b == Y');
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            path: ['a'],
            operator: '==',
            comparedValue: 'X',
            isNegated: false,
            isComputed: false,
            rawExpression: 'a == X',
        });
        expect(result[1]).toMatchObject({
            path: ['b'],
            operator: '==',
            comparedValue: 'Y',
            isNegated: false,
            isComputed: false,
            rawExpression: 'b == Y',
        });
    });

    it('compound OR: "a == X || b == Y"', () => {
        const result = tokenizeCondition('a == X || b == Y');
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({
            path: ['a'],
            operator: '==',
            comparedValue: 'X',
            isNegated: false,
            isComputed: false,
            rawExpression: 'a == X',
        });
        expect(result[1]).toMatchObject({
            path: ['b'],
            operator: '==',
            comparedValue: 'Y',
            isNegated: false,
            isComputed: false,
            rawExpression: 'b == Y',
        });
    });

    it('parenthesized: "(a || b) && c"', () => {
        const result = tokenizeCondition('(a || b) && c');
        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({
            path: ['a'],
            isNegated: false,
            isComputed: false,
            rawExpression: 'a',
        });
        expect(result[1]).toMatchObject({
            path: ['b'],
            isNegated: false,
            isComputed: false,
            rawExpression: 'b',
        });
        expect(result[2]).toMatchObject({
            path: ['c'],
            isNegated: false,
            isComputed: false,
            rawExpression: 'c',
        });
    });

    it('fully wrapped: "(a == B)"', () => {
        expect(tokenizeCondition('(a == B)')).toEqual([
            {
                path: ['a'],
                operator: '==',
                comparedValue: 'B',
                isNegated: false,
                isComputed: false,
                rawExpression: '(a == B)',
            },
        ]);
    });

    it('computed (JS property): "items.length > 0"', () => {
        expect(tokenizeCondition('items.length > 0')).toEqual([
            {
                path: ['items', 'length'],
                operator: '>',
                comparedValue: '0',
                isNegated: false,
                isComputed: true,
                rawExpression: 'items.length > 0',
            },
        ]);
    });

    it('complex/untokenizable (ternary): "a ? b : c"', () => {
        expect(tokenizeCondition('a ? b : c')).toEqual([
            {
                path: [],
                isNegated: false,
                isComputed: true,
                rawExpression: 'a ? b : c',
            },
        ]);
    });

    it('not equal: "status != ACTIVE"', () => {
        expect(tokenizeCondition('status != ACTIVE')).toEqual([
            {
                path: ['status'],
                operator: '!=',
                comparedValue: 'ACTIVE',
                isNegated: false,
                isComputed: false,
                rawExpression: 'status != ACTIVE',
            },
        ]);
    });

    it('negated comparison: "!(type == ADMIN)"', () => {
        expect(tokenizeCondition('!(type == ADMIN)')).toEqual([
            {
                path: ['type'],
                operator: '==',
                comparedValue: 'ADMIN',
                isNegated: true,
                isComputed: false,
                rawExpression: '!(type == ADMIN)',
            },
        ]);
    });

    it('empty string: ""', () => {
        expect(tokenizeCondition('')).toEqual([]);
    });

    it('whitespace handling: "  isAvailable  "', () => {
        expect(tokenizeCondition('  isAvailable  ')).toEqual([
            {
                path: ['isAvailable'],
                isNegated: false,
                isComputed: false,
                rawExpression: '  isAvailable  ',
            },
        ]);
    });
});
