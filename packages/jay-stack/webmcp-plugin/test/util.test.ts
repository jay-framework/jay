import { describe, it, expect } from 'vitest';
import { toKebab, toHumanReadable, parseCoordinate, jsonResult, textResult, errorResult } from '../lib/util';

describe('util', () => {
    describe('toKebab', () => {
        it('should convert camelCase to kebab-case', () => {
            expect(toKebab('removeBtn')).toBe('remove-btn');
            expect(toKebab('addToCartBtn')).toBe('add-to-cart-btn');
            expect(toKebab('nameInput')).toBe('name-input');
            expect(toKebab('btn')).toBe('btn');
        });
    });

    describe('toHumanReadable', () => {
        it('should convert camelCase to space-separated lowercase', () => {
            expect(toHumanReadable('removeBtn')).toBe('remove btn');
            expect(toHumanReadable('addToCartBtn')).toBe('add to cart btn');
        });
    });

    describe('parseCoordinate', () => {
        it('should split on /', () => {
            expect(parseCoordinate('addBtn')).toEqual(['addBtn']);
            expect(parseCoordinate('item-1/removeBtn')).toEqual(['item-1', 'removeBtn']);
        });
    });

    describe('result helpers', () => {
        it('jsonResult should format JSON', () => {
            const r = jsonResult('label', { a: 1 });
            expect(r.content[0].text).toContain('label');
            expect(r.content[0].text).toContain('"a": 1');
        });

        it('textResult should return text', () => {
            const r = textResult('hello');
            expect(r.content[0].text).toBe('hello');
        });

        it('errorResult should set isError', () => {
            const r = errorResult('bad');
            expect(r.isError).toBe(true);
            expect(r.content[0].text).toContain('bad');
        });
    });
});
