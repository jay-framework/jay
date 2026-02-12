import { describe, it, expect } from 'vitest';
import { groupInteractions } from '../lib/group-interactions';
import type { Interaction } from '../lib/types';

function makeInteraction(overrides: Partial<Interaction> & { refName: string }): Interaction {
    return {
        coordinate: [overrides.refName],
        element: document.createElement('button'),
        elementType: 'HTMLButtonElement',
        supportedEvents: ['click', 'focus', 'blur'],
        ...overrides,
    };
}

describe('groupInteractions', () => {
    it('should return empty array for empty input', () => {
        expect(groupInteractions([])).toEqual([]);
    });

    it('should group a single non-forEach ref', () => {
        const interactions = [makeInteraction({ refName: 'submitBtn' })];

        const grouped = groupInteractions(interactions);

        expect(grouped).toHaveLength(1);
        expect(grouped[0]).toEqual({
            ref: 'submitBtn',
            type: 'Button',
            events: ['click'],
            description: undefined,
        });
        expect(grouped[0].inForEach).toBeUndefined();
        expect(grouped[0].items).toBeUndefined();
    });

    it('should group multiple non-forEach refs', () => {
        const interactions = [
            makeInteraction({ refName: 'saveBtn' }),
            makeInteraction({ refName: 'cancelBtn' }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped).toHaveLength(2);
        expect(grouped[0].ref).toBe('saveBtn');
        expect(grouped[1].ref).toBe('cancelBtn');
    });

    it('should group forEach refs into a single entry with items', () => {
        const interactions = [
            makeInteraction({
                refName: 'removeBtn',
                coordinate: ['item-1', 'removeBtn'],
                itemContext: { id: 'item-1', name: 'Widget' },
            }),
            makeInteraction({
                refName: 'removeBtn',
                coordinate: ['item-2', 'removeBtn'],
                itemContext: { id: 'item-2', name: 'Gadget' },
            }),
            makeInteraction({
                refName: 'removeBtn',
                coordinate: ['item-3', 'removeBtn'],
                itemContext: { id: 'item-3', name: 'Gizmo' },
            }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].ref).toBe('removeBtn');
        expect(grouped[0].inForEach).toBe(true);
        expect(grouped[0].items).toEqual([
            { id: 'item-1', label: 'Widget' },
            { id: 'item-2', label: 'Gadget' },
            { id: 'item-3', label: 'Gizmo' },
        ]);
    });

    it('should detect single-item forEach by coordinate length', () => {
        // Even with just one item, coordinate length > 1 means it's in a forEach
        const interactions = [
            makeInteraction({
                refName: 'editBtn',
                coordinate: ['only-item', 'editBtn'],
                itemContext: { id: 'only-item', name: 'Lonely' },
            }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped).toHaveLength(1);
        expect(grouped[0].inForEach).toBe(true);
        expect(grouped[0].items).toEqual([{ id: 'only-item', label: 'Lonely' }]);
    });

    it('should mix forEach and non-forEach refs', () => {
        const interactions = [
            makeInteraction({
                refName: 'removeBtn',
                coordinate: ['item-1', 'removeBtn'],
                itemContext: { id: 'item-1', name: 'A' },
            }),
            makeInteraction({
                refName: 'removeBtn',
                coordinate: ['item-2', 'removeBtn'],
                itemContext: { id: 'item-2', name: 'B' },
            }),
            makeInteraction({ refName: 'addBtn', coordinate: ['addBtn'] }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped).toHaveLength(2);

        const removeGroup = grouped.find((g) => g.ref === 'removeBtn')!;
        expect(removeGroup.inForEach).toBe(true);
        expect(removeGroup.items).toHaveLength(2);

        const addGroup = grouped.find((g) => g.ref === 'addBtn')!;
        expect(addGroup.inForEach).toBeUndefined();
        expect(addGroup.items).toBeUndefined();
    });

    it('should map element types to friendly names', () => {
        const interactions = [
            makeInteraction({ refName: 'btn', elementType: 'HTMLButtonElement' }),
            makeInteraction({
                refName: 'input',
                elementType: 'HTMLInputElement',
                supportedEvents: ['click', 'input', 'change', 'focus', 'blur'],
            }),
            makeInteraction({
                refName: 'textarea',
                elementType: 'HTMLTextAreaElement',
                supportedEvents: ['click', 'input', 'change', 'focus', 'blur'],
            }),
            makeInteraction({
                refName: 'select',
                elementType: 'HTMLSelectElement',
                supportedEvents: ['click', 'change', 'focus', 'blur'],
            }),
            makeInteraction({ refName: 'link', elementType: 'HTMLAnchorElement', supportedEvents: ['click'] }),
            makeInteraction({ refName: 'display', elementType: 'HTMLSpanElement', supportedEvents: ['click', 'focus', 'blur'] }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped.find((g) => g.ref === 'btn')!.type).toBe('Button');
        expect(grouped.find((g) => g.ref === 'input')!.type).toBe('TextInput');
        expect(grouped.find((g) => g.ref === 'textarea')!.type).toBe('TextArea');
        expect(grouped.find((g) => g.ref === 'select')!.type).toBe('Select');
        expect(grouped.find((g) => g.ref === 'link')!.type).toBe('Link');
        expect(grouped.find((g) => g.ref === 'display')!.type).toBe('Span');
    });

    it('should filter to relevant events per element type', () => {
        const interactions = [
            makeInteraction({
                refName: 'btn',
                elementType: 'HTMLButtonElement',
                supportedEvents: ['click', 'focus', 'blur'],
            }),
            makeInteraction({
                refName: 'input',
                elementType: 'HTMLInputElement',
                supportedEvents: ['click', 'focus', 'blur', 'input', 'change'],
            }),
            makeInteraction({
                refName: 'select',
                elementType: 'HTMLSelectElement',
                supportedEvents: ['click', 'focus', 'blur', 'change'],
            }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped.find((g) => g.ref === 'btn')!.events).toEqual(['click']);
        expect(grouped.find((g) => g.ref === 'input')!.events).toEqual(['input', 'change']);
        expect(grouped.find((g) => g.ref === 'select')!.events).toEqual(['change']);
    });

    it('should preserve description from contract', () => {
        const interactions = [
            makeInteraction({ refName: 'addToCart', description: 'Add the product to cart' }),
        ];

        const grouped = groupInteractions(interactions);

        expect(grouped[0].description).toBe('Add the product to cart');
    });

    describe('guessLabel', () => {
        it('should use name field', () => {
            const interactions = [
                makeInteraction({
                    refName: 'btn',
                    coordinate: ['x', 'btn'],
                    itemContext: { id: 'x', name: 'My Name', title: 'My Title' },
                }),
            ];
            const grouped = groupInteractions(interactions);
            expect(grouped[0].items![0].label).toBe('My Name');
        });

        it('should fall back to title field', () => {
            const interactions = [
                makeInteraction({
                    refName: 'btn',
                    coordinate: ['x', 'btn'],
                    itemContext: { id: 'x', title: 'My Title' },
                }),
            ];
            const grouped = groupInteractions(interactions);
            expect(grouped[0].items![0].label).toBe('My Title');
        });

        it('should fall back to label field', () => {
            const interactions = [
                makeInteraction({
                    refName: 'btn',
                    coordinate: ['x', 'btn'],
                    itemContext: { id: 'x', label: 'My Label' },
                }),
            ];
            const grouped = groupInteractions(interactions);
            expect(grouped[0].items![0].label).toBe('My Label');
        });

        it('should fall back to text field', () => {
            const interactions = [
                makeInteraction({
                    refName: 'btn',
                    coordinate: ['x', 'btn'],
                    itemContext: { id: 'x', text: 'My Text' },
                }),
            ];
            const grouped = groupInteractions(interactions);
            expect(grouped[0].items![0].label).toBe('My Text');
        });

        it('should fall back to first string value', () => {
            const interactions = [
                makeInteraction({
                    refName: 'btn',
                    coordinate: ['x', 'btn'],
                    itemContext: { id: 'x', count: 5, description: 'fallback string' },
                }),
            ];
            const grouped = groupInteractions(interactions);
            // 'id' is the first string value
            expect(grouped[0].items![0].label).toBe('x');
        });

        it('should return empty string for no context', () => {
            const interactions = [
                makeInteraction({
                    refName: 'btn',
                    coordinate: ['x', 'btn'],
                }),
            ];
            const grouped = groupInteractions(interactions);
            expect(grouped[0].items![0].label).toBe('');
        });
    });
});
