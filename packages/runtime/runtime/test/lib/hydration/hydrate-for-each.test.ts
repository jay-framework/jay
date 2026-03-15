import {
    adoptText,
    adoptElement,
    adoptDynamicElement,
    STATIC,
    hydrateForEach,
    hydrateConditional,
    dynamicText as dt,
    dynamicElement as de,
    element as e,
} from '../../../lib';
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
        adoptDynamicElement<ViewState>('0', {}, [
            hydrateForEach<ViewState, Item>(
                (vs) => vs.items,
                'id',
                forEachAdopt,
                (_item, _id) => forEachCreate(),
            ),
        ]),
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

describe('hydrateForEach with static siblings (Kindergarten positioning)', () => {
    interface SiblingViewState {
        title: string;
        items: Item[];
    }

    // SSR HTML: h1 before list, buttons after list
    const withSiblingsHTML =
        '<div jay-coordinate="0">' +
        '<h1 jay-coordinate="0/0">Title</h1>' +
        '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
        '<li jay-coordinate="b"><span jay-coordinate="b/0">Bob</span></li>' +
        '<button jay-coordinate="0/2">Add</button>' +
        '</div>';

    function hydrateWithSiblings(title: string, items: Item[]) {
        return hydrate<SiblingViewState>(withSiblingsHTML, { title, items }, () =>
            adoptDynamicElement<SiblingViewState>('0', {}, [
                adoptText<SiblingViewState>('0/0', (vs) => vs.title),
                hydrateForEach<SiblingViewState, Item>(
                    (vs) => vs.items,
                    'id',
                    forEachAdopt,
                    (_item, _id) => forEachCreate(),
                ),
                STATIC,
            ]),
        );
    }

    it('add item inserts after existing items, before button', () => {
        const { jayElement, root } = hydrateWithSiblings('Title', [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ]);
        const container = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({
            title: 'Title',
            items: [
                { id: 'a', name: 'Alice' },
                { id: 'b', name: 'Bob' },
                { id: 'c', name: 'Charlie' },
            ],
        });

        // Verify order: h1, Alice, Bob, Charlie, button
        const children = Array.from(container.childNodes).filter(
            (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        expect(children[0].nodeName).toBe('H1');
        expect(children[1].textContent).toBe('Alice');
        expect(children[2].textContent).toBe('Bob');
        expect(children[3].textContent).toBe('Charlie');
        expect(children[4].nodeName).toBe('BUTTON');
    });

    it('remove all items preserves surrounding siblings', () => {
        const { jayElement, root } = hydrateWithSiblings('Title', [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ]);
        const container = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({ title: 'Title', items: [] });

        const children = Array.from(container.childNodes).filter(
            (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        expect(children.length).toBe(2);
        expect(children[0].nodeName).toBe('H1');
        expect(children[1].nodeName).toBe('BUTTON');
    });

    it('add items from empty preserves position between siblings', () => {
        const emptyHTML =
            '<div jay-coordinate="0">' +
            '<h1 jay-coordinate="0/0">Title</h1>' +
            '<button jay-coordinate="0/2">Add</button>' +
            '</div>';

        const { jayElement, root } = hydrate<SiblingViewState>(
            emptyHTML,
            { title: 'Title', items: [] },
            () =>
                adoptDynamicElement<SiblingViewState>('0', {}, [
                    adoptText<SiblingViewState>('0/0', (vs) => vs.title),
                    hydrateForEach<SiblingViewState, Item>(
                        (vs) => vs.items,
                        'id',
                        forEachAdopt,
                        (_item, _id) => forEachCreate(),
                    ),
                    STATIC,
                ]),
        );
        const container = root.querySelector('[jay-coordinate="0"]')!;

        jayElement.update({
            title: 'Title',
            items: [{ id: 'x', name: 'Xavier' }],
        });

        const children = Array.from(container.childNodes).filter(
            (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        expect(children[0].nodeName).toBe('H1');
        expect(children[1].textContent).toBe('Xavier');
        expect(children[2].nodeName).toBe('BUTTON');
    });
});

describe('hydrateConditional + forEach + STATIC (mixed children)', () => {
    interface MixedViewState {
        show: boolean;
        label: string;
        items: Item[];
    }

    it('conditional toggle does not displace forEach items or static siblings', () => {
        const html =
            '<div jay-coordinate="0">' +
            '<h1 jay-coordinate="0/0">Header</h1>' +
            '<span jay-coordinate="0/1">Conditional</span>' +
            '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
            '<p>Footer</p>' +
            '</div>';

        const { jayElement, root } = hydrate<MixedViewState>(
            html,
            { show: true, label: 'Conditional', items: [{ id: 'a', name: 'Alice' }] },
            () =>
                adoptDynamicElement<MixedViewState>('0', {}, [
                    STATIC,
                    hydrateConditional<MixedViewState>(
                        (vs) => vs.show,
                        () => adoptText<MixedViewState>('0/1', (vs) => vs.label),
                    ),
                    hydrateForEach<MixedViewState, Item>(
                        (vs) => vs.items,
                        'id',
                        forEachAdopt,
                        (_item, _id) => forEachCreate(),
                    ),
                    STATIC,
                ]),
        );
        const container = root.querySelector('[jay-coordinate="0"]')!;

        // Hide conditional
        jayElement.update({
            show: false,
            label: 'Conditional',
            items: [{ id: 'a', name: 'Alice' }],
        });

        let elements = Array.from(container.childNodes).filter(
            (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        expect(elements[0].nodeName).toBe('H1');
        // conditional removed, forEach item should be at index 1
        expect(elements[1].textContent).toBe('Alice');
        expect(elements[2].nodeName).toBe('P');

        // Show conditional again
        jayElement.update({
            show: true,
            label: 'Conditional',
            items: [{ id: 'a', name: 'Alice' }],
        });

        elements = Array.from(container.childNodes).filter((n) => n.nodeType === Node.ELEMENT_NODE);
        expect(elements[0].nodeName).toBe('H1');
        expect(elements[1].textContent).toBe('Conditional');
        expect(elements[2].textContent).toBe('Alice');
        expect(elements[3].nodeName).toBe('P');
    });

    it('add forEach item while conditional is hidden — correct position', () => {
        const html =
            '<div jay-coordinate="0">' +
            '<span jay-coordinate="0/0">Visible</span>' +
            '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
            '</div>';

        const { jayElement, root } = hydrate<MixedViewState>(
            html,
            { show: true, label: 'Visible', items: [{ id: 'a', name: 'Alice' }] },
            () =>
                adoptDynamicElement<MixedViewState>('0', {}, [
                    hydrateConditional<MixedViewState>(
                        (vs) => vs.show,
                        () => adoptText<MixedViewState>('0/0', (vs) => vs.label),
                    ),
                    hydrateForEach<MixedViewState, Item>(
                        (vs) => vs.items,
                        'id',
                        forEachAdopt,
                        (_item, _id) => forEachCreate(),
                    ),
                ]),
        );
        const container = root.querySelector('[jay-coordinate="0"]')!;

        // Hide conditional, add item
        jayElement.update({
            show: false,
            label: 'Visible',
            items: [
                { id: 'a', name: 'Alice' },
                { id: 'b', name: 'Bob' },
            ],
        });

        let elements = Array.from(container.childNodes).filter(
            (n) => n.nodeType === Node.ELEMENT_NODE,
        );
        // conditional hidden, two forEach items
        expect(elements.length).toBe(2);
        expect(elements[0].textContent).toBe('Alice');
        expect(elements[1].textContent).toBe('Bob');

        // Show conditional again
        jayElement.update({
            show: true,
            label: 'Back',
            items: [
                { id: 'a', name: 'Alice' },
                { id: 'b', name: 'Bob' },
            ],
        });

        elements = Array.from(container.childNodes).filter((n) => n.nodeType === Node.ELEMENT_NODE);
        expect(elements.length).toBe(3);
        expect(elements[0].textContent).toBe('Back');
        expect(elements[1].textContent).toBe('Alice');
        expect(elements[2].textContent).toBe('Bob');
    });
});
