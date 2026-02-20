import {
    ConstructContext,
    ReferencesManager,
    adoptText,
    hydrateForEach,
    dynamicText as dt,
    dynamicElement as de,
} from '../../../lib';

function makeServerHTML(html: string): Element {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

interface Item {
    id: string;
    name: string;
}

interface ViewState {
    items: Item[];
}

describe('hydrateForEach', () => {
    // Test #25: adopts all existing items
    it('adopts all existing items — node identity preserved', () => {
        // Item root elements (<li>) have coordinates matching trackBy values.
        // Inner elements use the forItem scope prefix (e.g., "a/0").
        const root = makeServerHTML(
            '<ul jay-coordinate="0">' +
                '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
                '<li jay-coordinate="b"><span jay-coordinate="b/0">Bob</span></li>' +
                '</ul>',
        );
        const li1 = root.querySelector('[jay-coordinate="a"]')!;
        const li2 = root.querySelector('[jay-coordinate="b"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        ConstructContext.withHydrationRootContext<ViewState, {}>(
            {
                items: [
                    { id: 'a', name: 'Alice' },
                    { id: 'b', name: 'Bob' },
                ],
            },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0', // container coordinate (<ul>)
                    (vs) => vs.items,
                    'id',
                    // adoptItem: adopts inner elements within the forItem scope
                    () => adoptText<Item>('0', (item) => item.name),
                    // createItem: creates new items from scratch
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

        // Node identity preserved
        expect(root.querySelector('[jay-coordinate="a"]')).toBe(li1);
        expect(root.querySelector('[jay-coordinate="b"]')).toBe(li2);
    });

    // Test #26: item dynamic content updates
    it('item dynamic content updates on ViewState change', () => {
        const root = makeServerHTML(
            '<ul jay-coordinate="0">' +
                '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
                '<li jay-coordinate="b"><span jay-coordinate="b/0">Bob</span></li>' +
                '</ul>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<ViewState, {}>(
            {
                items: [
                    { id: 'a', name: 'Alice' },
                    { id: 'b', name: 'Bob' },
                ],
            },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => adoptText<Item>('0', (item) => item.name),
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

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
        const root = makeServerHTML(
            '<ul jay-coordinate="0">' +
                '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
                '</ul>',
        );
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<ViewState, {}>(
            { items: [{ id: 'a', name: 'Alice' }] },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => adoptText<Item>('0', (item) => item.name),
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

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
        const root = makeServerHTML(
            '<ul jay-coordinate="0">' +
                '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
                '<li jay-coordinate="b"><span jay-coordinate="b/0">Bob</span></li>' +
                '</ul>',
        );
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<ViewState, {}>(
            {
                items: [
                    { id: 'a', name: 'Alice' },
                    { id: 'b', name: 'Bob' },
                ],
            },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => adoptText<Item>('0', (item) => item.name),
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

        jayElement.update({ items: [{ id: 'b', name: 'Bob' }] });

        const lis = ul.querySelectorAll('li');
        expect(lis.length).toBe(1);
        expect(lis[0].textContent).toBe('Bob');
    });

    // Test #30: reorder items
    it('reorder items — DOM order matches new array order', () => {
        const root = makeServerHTML(
            '<ul jay-coordinate="0">' +
                '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
                '<li jay-coordinate="b"><span jay-coordinate="b/0">Bob</span></li>' +
                '</ul>',
        );
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<ViewState, {}>(
            {
                items: [
                    { id: 'a', name: 'Alice' },
                    { id: 'b', name: 'Bob' },
                ],
            },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => adoptText<Item>('0', (item) => item.name),
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

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
        const root = makeServerHTML(
            '<ul jay-coordinate="0">' +
                '<li jay-coordinate="a"><span jay-coordinate="a/0">Alice</span></li>' +
                '</ul>',
        );
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<ViewState, {}>(
            { items: [{ id: 'a', name: 'Alice' }] },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => adoptText<Item>('0', (item) => item.name),
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

        jayElement.update({ items: [] });

        expect(ul.querySelectorAll('li').length).toBe(0);
    });

    // Test #32: start from empty list
    it('start from empty list — items created via createItem', () => {
        const root = makeServerHTML('<ul jay-coordinate="0"></ul>');
        const ul = root.querySelector('[jay-coordinate="0"]')!;

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const jayElement = ConstructContext.withHydrationRootContext<ViewState, {}>(
            { items: [] },
            refManager,
            root,
            () => {
                hydrateForEach<ViewState, Item>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => adoptText<Item>('0', (item) => item.name),
                    (_item, _id) => de<Item>('li', {}, [dt((i: Item) => i.name)]),
                );
            },
        );

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
