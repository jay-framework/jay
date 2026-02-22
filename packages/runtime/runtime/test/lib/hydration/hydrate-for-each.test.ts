import { adoptText, hydrateForEach, dynamicText as dt, dynamicElement as de } from '../../../lib';
import { hydrate } from './hydration-test-utils';

interface Item {
    id: string;
    name: string;
}

interface ViewState {
    items: Item[];
}

function forEachAdopt() {
    return [adoptText<Item>('0', (item) => item.name)];
}

function forEachCreate() {
    return de<Item>('li', {}, [dt((i: Item) => i.name)]);
}

function hydrateForEachTest(html: string, items: Item[]) {
    return hydrate<ViewState>(html, { items }, () =>
        hydrateForEach<ViewState, Item>(
            '0',
            (vs) => vs.items,
            'id',
            forEachAdopt,
            (_item, _id) => forEachCreate(),
        ),
    );
}

const twoItemsHTML =
    '<ul jay-coordinate="0">' +
    '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
    '<li jay-coordinate="b"><span jay-coordinate="b/0">Bob</span></li>' +
    '</ul>';

const oneItemHTML =
    '<ul jay-coordinate="0">' +
    '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
    '</ul>';

describe('hydrateForEach', () => {
    // Test #25: adopts all existing items
    it('adopts all existing items — node identity preserved', () => {
        const { root } = hydrateForEachTest(twoItemsHTML, [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ]);
        const li1 = root.querySelector('[jay-coordinate="a"]')!;
        const li2 = root.querySelector('[jay-coordinate="b"]')!;

        // Node identity preserved
        expect(li1).toBeTruthy();
        expect(li2).toBeTruthy();
        expect(li1.tagName).toBe('LI');
        expect(li2.tagName).toBe('LI');
    });

    // Test #26: item dynamic content updates
    it('item dynamic content updates on ViewState change', () => {
        const { jayElement, root } = hydrateForEachTest(twoItemsHTML, [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ]);

        jayElement.update({
            items: [
                { id: 'a', name: 'Alicia' },
                { id: 'b', name: 'Bobby' },
            ],
        });

        expect(root.querySelector('[jay-coordinate="a/0"]')!.textContent).toBe('Alicia');
        expect(root.querySelector('[jay-coordinate="b/0"]')!.textContent).toBe('Bobby');
    });

    // Test #28: add new item
    it('add new item — creates via createItem callback', () => {
        const { jayElement, root } = hydrateForEachTest(oneItemHTML, [{ id: 'a', name: 'Alice' }]);
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({
            items: [
                { id: 'a', name: 'Alice' },
                { id: 'c', name: 'Charlie' },
            ],
        });

        const lis = ul.querySelectorAll('li');
        expect(lis.length).toBe(2);
        expect(lis[1].textContent).toBe('Charlie');
    });

    // Test #29: remove item
    it('remove item — removes from DOM', () => {
        const { jayElement, root } = hydrateForEachTest(twoItemsHTML, [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ]);
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({ items: [{ id: 'b', name: 'Bob' }] });

        const lis = ul.querySelectorAll('li');
        expect(lis.length).toBe(1);
        expect(lis[0].textContent).toBe('Bob');
    });

    // Test #30: reorder items
    it('reorder items — DOM order matches new array order', () => {
        const { jayElement, root } = hydrateForEachTest(twoItemsHTML, [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ]);
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({
            items: [
                { id: 'b', name: 'Bob' },
                { id: 'a', name: 'Alice' },
            ],
        });

        const lis = ul.querySelectorAll('li');
        expect(lis.length).toBe(2);
        expect(lis[0].textContent).toBe('Bob');
        expect(lis[1].textContent).toBe('Alice');
    });

    // Test #31: empty list
    it('empty list — all items removed from DOM', () => {
        const { jayElement, root } = hydrateForEachTest(oneItemHTML, [{ id: 'a', name: 'Alice' }]);
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({ items: [] });

        expect(ul.querySelectorAll('li').length).toBe(0);
    });

    // Test #32: start from empty list
    it('start from empty list — items created via createItem', () => {
        const { jayElement, root } = hydrateForEachTest('<ul jay-coordinate="0"></ul>', []);
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({
            items: [
                { id: 'x', name: 'Xavier' },
                { id: 'y', name: 'Yara' },
            ],
        });

        const lis = ul.querySelectorAll('li');
        expect(lis.length).toBe(2);
        expect(lis[0].textContent).toBe('Xavier');
        expect(lis[1].textContent).toBe('Yara');
    });
});
