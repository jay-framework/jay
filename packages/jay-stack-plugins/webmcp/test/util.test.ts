import { describe, it, expect } from 'vitest';
import { toKebab, toHumanReadable, parseCoordinate, jsonResult, textResult, errorResult, getSelectOptions, isCheckable, setElementValue, getValueEventTypes } from '../lib/util';

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

    describe('getSelectOptions', () => {
        it('should return option values for a select element', () => {
            const select = document.createElement('select');
            select.innerHTML = '<option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option>';
            expect(getSelectOptions(select)).toEqual(['sm', 'md', 'lg']);
        });

        it('should return undefined for non-select elements', () => {
            expect(getSelectOptions(document.createElement('input'))).toBeUndefined();
            expect(getSelectOptions(document.createElement('button'))).toBeUndefined();
        });

        it('should return empty array for select with no options', () => {
            const select = document.createElement('select');
            expect(getSelectOptions(select)).toEqual([]);
        });
    });

    describe('isCheckable', () => {
        it('should return true for checkbox inputs', () => {
            const el = document.createElement('input');
            el.type = 'checkbox';
            expect(isCheckable(el)).toBe(true);
        });

        it('should return true for radio inputs', () => {
            const el = document.createElement('input');
            el.type = 'radio';
            expect(isCheckable(el)).toBe(true);
        });

        it('should return false for text inputs', () => {
            const el = document.createElement('input');
            el.type = 'text';
            expect(isCheckable(el)).toBe(false);
        });

        it('should return false for non-input elements', () => {
            expect(isCheckable(document.createElement('button'))).toBe(false);
            expect(isCheckable(document.createElement('select'))).toBe(false);
        });
    });

    describe('setElementValue', () => {
        it('should set .checked for checkbox inputs', () => {
            const el = document.createElement('input');
            el.type = 'checkbox';
            setElementValue(el, 'true');
            expect(el.checked).toBe(true);
            setElementValue(el, 'false');
            expect(el.checked).toBe(false);
        });

        it('should set .checked for radio inputs', () => {
            const el = document.createElement('input');
            el.type = 'radio';
            setElementValue(el, 'true');
            expect(el.checked).toBe(true);
        });

        it('should set .value for text inputs', () => {
            const el = document.createElement('input');
            el.type = 'text';
            setElementValue(el, 'hello');
            expect(el.value).toBe('hello');
        });

        it('should set .value for select elements', () => {
            const el = document.createElement('select');
            el.innerHTML = '<option value="a">A</option><option value="b">B</option>';
            setElementValue(el, 'b');
            expect(el.value).toBe('b');
        });
    });

    describe('getValueEventTypes', () => {
        it('should return both input and change when both are registered', () => {
            expect(getValueEventTypes(['input', 'change'])).toEqual(['input', 'change']);
        });

        it('should return ["change"] when only change is registered', () => {
            expect(getValueEventTypes(['change'])).toEqual(['change']);
        });

        it('should return ["input"] when only input is registered', () => {
            expect(getValueEventTypes(['input'])).toEqual(['input']);
        });

        it('should return both in correct order regardless of registration order', () => {
            expect(getValueEventTypes(['change', 'input'])).toEqual(['input', 'change']);
        });

        it('should fall back to first event when neither input nor change', () => {
            expect(getValueEventTypes(['blur', 'focus'])).toEqual(['blur']);
        });

        it('should fall back to ["input"] for empty events array', () => {
            expect(getValueEventTypes([])).toEqual(['input']);
        });
    });
});
