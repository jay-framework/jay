import { describe, it, expect } from 'vitest';
import { groupInteractions } from '../lib';
import type { CollectedInteraction } from '../lib/types';

function makeRaw(
    overrides: Partial<CollectedInteraction> & { refName: string },
): CollectedInteraction {
    return {
        coordinate: [overrides.refName],
        element: document.createElement('button'),
        supportedEvents: ['click', 'focus', 'blur'],
        ...overrides,
    };
}

describe('groupInteractions', () => {
    it('should return empty array for empty input', () => {
        expect(groupInteractions([])).toEqual([]);
    });

    it('should group by refName', () => {
        const raw = [makeRaw({ refName: 'submitBtn' }), makeRaw({ refName: 'cancelBtn' })];

        const grouped = groupInteractions(raw);

        expect(grouped).toHaveLength(2);
        expect(grouped[0].refName).toBe('submitBtn');
        expect(grouped[0].items).toHaveLength(1);
        expect(grouped[1].refName).toBe('cancelBtn');
        expect(grouped[1].items).toHaveLength(1);
    });

    it('should collapse forEach items under a single Interaction', () => {
        const raw = [
            makeRaw({ refName: 'removeBtn', coordinate: ['item-1', 'removeBtn'] }),
            makeRaw({ refName: 'removeBtn', coordinate: ['item-2', 'removeBtn'] }),
        ];

        const grouped = groupInteractions(raw);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].refName).toBe('removeBtn');
        expect(grouped[0].items).toHaveLength(2);
        expect(grouped[0].items[0].coordinate).toEqual(['item-1', 'removeBtn']);
        expect(grouped[0].items[1].coordinate).toEqual(['item-2', 'removeBtn']);
    });

    it('should preserve DOM element on each instance', () => {
        const btn = document.createElement('button');
        const raw = [makeRaw({ refName: 'btn', element: btn })];

        const grouped = groupInteractions(raw);

        expect(grouped[0].items[0].element).toBe(btn);
    });

    it('should filter button events to just click', () => {
        const raw = [
            makeRaw({
                refName: 'btn',
                element: document.createElement('button'),
                supportedEvents: ['click', 'focus', 'blur'],
            }),
        ];

        const grouped = groupInteractions(raw);

        expect(grouped[0].items[0].events).toEqual(['click']);
    });

    it('should filter input events to input and change', () => {
        const raw = [
            makeRaw({
                refName: 'nameInput',
                element: document.createElement('input'),
                supportedEvents: ['click', 'focus', 'blur', 'input', 'change'],
            }),
        ];

        const grouped = groupInteractions(raw);

        expect(grouped[0].items[0].events).toEqual(['input', 'change']);
    });

    it('should filter select events to input and change', () => {
        const raw = [
            makeRaw({
                refName: 'sizeSelect',
                element: document.createElement('select'),
                supportedEvents: ['click', 'focus', 'blur', 'change'],
            }),
        ];

        const grouped = groupInteractions(raw);

        expect(grouped[0].items[0].events).toEqual(['change']);
    });

    it('should filter anchor events to just click', () => {
        const raw = [
            makeRaw({
                refName: 'link',
                element: document.createElement('a'),
                supportedEvents: ['click'],
            }),
        ];

        const grouped = groupInteractions(raw);

        expect(grouped[0].items[0].events).toEqual(['click']);
    });

    it('should preserve description from first item', () => {
        const raw = [makeRaw({ refName: 'addToCart', description: 'Add product to cart' })];

        const grouped = groupInteractions(raw);

        expect(grouped[0].description).toBe('Add product to cart');
    });

    it('should handle multi-segment coordinates for nested forEach', () => {
        const raw = [
            makeRaw({ refName: 'editBtn', coordinate: ['parent-1', 'child-a', 'editBtn'] }),
        ];

        const grouped = groupInteractions(raw);

        expect(grouped[0].items[0].coordinate).toEqual(['parent-1', 'child-a', 'editBtn']);
    });
});
