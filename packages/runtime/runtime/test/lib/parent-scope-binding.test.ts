import {
    forEach,
    dynamicElement as de,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
} from '../../lib/element';
import { JayElement, ReferencesManager, ConstructContext } from '../../lib';

// DL#193 Capability A — `$parent` reactive text/attribute bindings inside a forEach.
// A `$parent` binding compiles to an extra closure param the runtime supplies from the
// live parent context: `dt((item, p) => p.field)`, `dt((cell, p1, p2) => p2.field)`.

interface Item {
    name: string;
    id: string;
}
interface ListVS {
    listTitle: string;
    items: Item[];
}

const itemA = { name: 'A', id: 'a' };
const itemB = { name: 'B', id: 'b' };
const itemC = { name: 'C', id: 'c' };

function makeList(data: ListVS, dependsOnParent: boolean) {
    const calls = { parent: 0, item: 0 };
    const [refManager, []] = ReferencesManager.for({}, [], [], [], []);
    const el = ConstructContext.withRootContext<ListVS, any>(data, refManager, () =>
        de('ul', {}, [
            forEach(
                (vs: ListVS) => vs.items,
                (item: Item) =>
                    e('li', { class: 'item', id: item.id }, [
                        e('span', { class: 'name' }, [
                            dt((item: Item) => {
                                calls.item++;
                                return item.name;
                            }),
                        ]),
                        e('span', { class: 'title' }, [
                            dt((item: Item, p: ListVS) => {
                                calls.parent++;
                                return p.listTitle;
                            }),
                        ]),
                    ]),
                'id',
                dependsOnParent,
            ),
        ]),
    );
    return { el, calls };
}

const titlesOf = (el: JayElement<any, any>) =>
    [...el.dom.querySelectorAll('.title')].map((n) => n.textContent);
const namesOf = (el: JayElement<any, any>) =>
    [...el.dom.querySelectorAll('.name')].map((n) => n.textContent);

describe('DL#193 $parent binding — gate truth table (forEach)', () => {
    it('renders the initial parent value in every item', () => {
        const { el } = makeList({ listTitle: 'Groceries', items: [itemA, itemB, itemC] }, true);
        expect(titlesOf(el)).toEqual(['Groceries', 'Groceries', 'Groceries']);
        expect(namesOf(el)).toEqual(['A', 'B', 'C']);
    });

    // Case #1 — the regression this design exists to prevent: parent changed, items
    // array reference unchanged (keyed reuse). Gate 1 (`items !== lastItems`) would
    // short-circuit; dependsOnParent weakens it so the $parent leaves update.
    it('updates $parent leaves when parent changes and the items array ref is unchanged', () => {
        const items = [itemA, itemB, itemC];
        const { el, calls } = makeList({ listTitle: 'Groceries', items }, true);
        calls.parent = 0;
        el.update({ listTitle: 'Renamed', items }); // same array reference
        expect(titlesOf(el)).toEqual(['Renamed', 'Renamed', 'Renamed']);
        expect(calls.parent).toBe(3); // each item's $parent leaf recomputed
    });

    // Without the flag, the fast gate is preserved — the $parent leaves are NOT
    // recomputed, so the binding would go stale. This documents why the flag is required.
    it('does NOT update $parent leaves without dependsOnParent (fast path preserved)', () => {
        const items = [itemA, itemB, itemC];
        const { el, calls } = makeList({ listTitle: 'Groceries', items }, false);
        calls.parent = 0;
        el.update({ listTitle: 'Renamed', items }); // same array reference
        expect(calls.parent).toBe(0); // gate 1 short-circuited — no recompute
        expect(titlesOf(el)).toEqual(['Groceries', 'Groceries', 'Groceries']); // stale
    });

    // Case #2 — parent and items both change.
    it('updates both $parent and item leaves when both change', () => {
        const { el } = makeList({ listTitle: 'Groceries', items: [itemA, itemB] }, true);
        el.update({ listTitle: 'Renamed', items: [itemA, itemB, itemC] });
        expect(titlesOf(el)).toEqual(['Renamed', 'Renamed', 'Renamed']);
        expect(namesOf(el)).toEqual(['A', 'B', 'C']);
    });

    // Case #5 — reorder (new array, same item refs), parent unchanged.
    it('keeps $parent correct across a reorder with parent unchanged', () => {
        const { el } = makeList({ listTitle: 'Groceries', items: [itemA, itemB, itemC] }, true);
        el.update({ listTitle: 'Groceries', items: [itemC, itemA, itemB] });
        expect(namesOf(el)).toEqual(['C', 'A', 'B']);
        expect(titlesOf(el)).toEqual(['Groceries', 'Groceries', 'Groceries']);
    });

    // Fast path preserved (existing immutable behavior): passing the same array ref
    // with an in-place mutated member does not re-render when dependsOnParent is false.
    it('preserves the immutable-array fast path when dependsOnParent is false', () => {
        const items = [{ ...itemA }, { ...itemB }];
        const { el, calls } = makeList({ listTitle: 'T', items }, false);
        calls.item = 0;
        items[0].name = 'mutated';
        el.update({ listTitle: 'T', items }); // same array ref
        expect(calls.item).toBe(0); // no re-render, as documented for immutable arrays
    });
});

describe('DL#193 $parent binding — attribute binding', () => {
    it('updates a {$parent.field} attribute when the parent changes (items unchanged)', () => {
        const items = [itemA, itemB];
        const [refManager, []] = ReferencesManager.for({}, [], [], [], []);
        const el = ConstructContext.withRootContext<ListVS, any>(
            { listTitle: 'group-1', items },
            refManager,
            () =>
                de('ul', {}, [
                    forEach(
                        (vs: ListVS) => vs.items,
                        (item: Item) =>
                            e(
                                'li',
                                {
                                    class: 'item',
                                    'data-group': da((item: Item, p: ListVS) => p.listTitle),
                                },
                                [dt((item: Item) => item.name)],
                            ),
                        'id',
                        true,
                    ),
                ]),
        );
        expect(
            [...el.dom.querySelectorAll('.item')].map((n) => n.getAttribute('data-group')),
        ).toEqual(['group-1', 'group-1']);
        el.update({ listTitle: 'group-2', items });
        expect(
            [...el.dom.querySelectorAll('.item')].map((n) => n.getAttribute('data-group')),
        ).toEqual(['group-2', 'group-2']);
    });
});

describe('DL#193 $parent binding — grandparent depth ($parent.$parent)', () => {
    interface Cell {
        id: string;
        label: string;
    }
    interface Row {
        id: string;
        cells: Cell[];
    }
    interface GridVS {
        title: string;
        rows: Row[];
    }

    function makeGrid(data: GridVS) {
        const [refManager, []] = ReferencesManager.for({}, [], [], [], []);
        return ConstructContext.withRootContext<GridVS, any>(data, refManager, () =>
            de('table', {}, [
                forEach(
                    (vs: GridVS) => vs.rows,
                    (row: Row) =>
                        de('tr', {}, [
                            forEach(
                                (row: Row) => row.cells,
                                (cell: Cell) =>
                                    e('td', { class: 'cell' }, [
                                        // grandparent access: level 2 → GridVS
                                        dt((cell: Cell, p1: Row, p2: GridVS) => p2.title),
                                    ]),
                                'id',
                                true, // inner depends on parent chain
                            ),
                        ]),
                    'id',
                    true, // outer must also be forced so the change reaches the inner
                ),
            ]),
        );
    }

    it('updates a $parent.$parent binding when the grandparent changes, rows/cells unchanged', () => {
        const rows: Row[] = [
            { id: 'r1', cells: [{ id: 'c1', label: 'x' }] },
            { id: 'r2', cells: [{ id: 'c2', label: 'y' }] },
        ];
        const el = makeGrid({ title: 'v1', rows });
        expect([...el.dom.querySelectorAll('.cell')].map((n) => n.textContent)).toEqual([
            'v1',
            'v1',
        ]);
        el.update({ title: 'v2', rows }); // same rows array + same row/cell refs
        expect([...el.dom.querySelectorAll('.cell')].map((n) => n.textContent)).toEqual([
            'v2',
            'v2',
        ]);
    });
});
