import {
    ConstructContext,
    ReferencesManager,
    adoptElement,
    adoptDynamicElement,
    adoptText,
    childCompHydrate,
    hydrateForEach,
    hydrateConditional,
    element as e,
    dynamicText as dt,
} from '../../../lib';
import { makeJayComponent } from '@jay-framework/component';
import { hydrate, makeServerHTML } from './hydration-test-utils';

describe('childCompHydrate', () => {
    interface PageViewState {
        pageTitle: string;
    }

    interface ProductViewState {
        name: string;
        price: number;
    }

    // With scoped coordinates (DL#126), the child component's preRender uses
    // coordinates from the LOCAL scope map (built from the scope root's subtree).
    // The coordinates here (S1/0, S1/1, S1/2) are what the child sees in its local map.
    function makeHydrateComponent() {
        const preRender = (options?: any) => {
            const [refManager] = ReferencesManager.for(options, [], [], [], []);
            const render = (viewState: ProductViewState) =>
                ConstructContext.withHydrationChildContext<ProductViewState, {}>(
                    viewState,
                    refManager,
                    () =>
                        adoptElement<ProductViewState>('S1/0', {}, [
                            adoptText<ProductViewState>('S1/1', (vs) => vs.name),
                            adoptText<ProductViewState>('S1/2', (vs) => vs.price),
                        ]),
                );
            return [refManager.getPublicAPI(), render] as any;
        };

        const constructor = (_props: any, _refs: any) => ({
            render: () => ({ name: 'Test', price: 99 }),
        });

        return makeJayComponent(preRender, constructor as any);
    }

    it('scopes coordinate resolution to instance prefix', () => {
        // In scoped coordinates, the scope root (article) has jay-coordinate="S1/0"
        // and its children have S1/1, S1/2. childCompHydrate resolves "S1/0" from
        // the parent map, builds a local map from the article's subtree.
        const root = makeServerHTML(
            '<div jay-coordinate="0">' +
                '<h1 jay-coordinate="1">Page Title</h1>' +
                '<article jay-coordinate="S1/0">' +
                '<span jay-coordinate="S1/1">Widget</span>' +
                '<span jay-coordinate="S1/2">99</span>' +
                '</article>' +
                '</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const ProductComp = makeHydrateComponent();

        const jayElement = ConstructContext.withHydrationRootContext<PageViewState, {}>(
            { pageTitle: 'Page Title' },
            refManager,
            root,
            () =>
                adoptElement<PageViewState>('0', {}, [
                    adoptText<PageViewState>('1', (vs) => vs.pageTitle),
                    childCompHydrate(ProductComp, (_vs: PageViewState) => ({}), 'S1/0'),
                ]),
        );

        // The article element should be adopted (not created fresh)
        const article = root.querySelector('[jay-coordinate="S1/0"]');
        expect(article).toBeTruthy();

        // Text nodes should be adopted and wired up
        const nameSpan = root.querySelector('[jay-coordinate="S1/1"]');
        expect(nameSpan).toBeTruthy();
        expect(nameSpan!.textContent).toBe('Widget');
    });

    it('adopts correct elements with nested coordinate prefix (slowForEach)', () => {
        // In scoped coordinates, the slowForEach item has its own scope (S1).
        // The headless instance inside it has scope S2. The scope root is S2/0 (the article).
        const root = makeServerHTML(
            '<div jay-coordinate="0">' +
                '<article jay-coordinate="S2/0">' +
                '<span jay-coordinate="S2/1">Item A</span>' +
                '<span jay-coordinate="S2/2">42</span>' +
                '</article>' +
                '</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);

        // Create a component that adopts using S2/* coordinates (its local scope)
        const preRender = (options?: any) => {
            const [rm] = ReferencesManager.for(options, [], [], [], []);
            const render = (viewState: ProductViewState) =>
                ConstructContext.withHydrationChildContext<ProductViewState, {}>(
                    viewState,
                    rm,
                    () =>
                        adoptElement<ProductViewState>('S2/0', {}, [
                            adoptText<ProductViewState>('S2/1', (vs) => vs.name),
                            adoptText<ProductViewState>('S2/2', (vs) => vs.price),
                        ]),
                );
            return [rm.getPublicAPI(), render] as any;
        };
        const ProductComp = makeJayComponent(preRender, ((_p: any, _r: any) => ({
            render: () => ({ name: 'Test', price: 99 }),
        })) as any);

        ConstructContext.withHydrationRootContext<PageViewState, {}>(
            { pageTitle: 'Page' },
            refManager,
            root,
            () =>
                adoptElement<PageViewState>('0', {}, [
                    childCompHydrate(ProductComp, (_vs: PageViewState) => ({}), 'S2/0'),
                ]),
        );

        const article = root.querySelector('[jay-coordinate="S2/0"]');
        expect(article).toBeTruthy();
    });

    it('does not interfere with parent coordinate resolution', () => {
        const root = makeServerHTML(
            '<div jay-coordinate="0">' +
                '<h1 jay-coordinate="1">Title</h1>' +
                '<article jay-coordinate="S1/0">' +
                '<span jay-coordinate="S1/1">Widget</span>' +
                '<span jay-coordinate="S1/2">99</span>' +
                '</article>' +
                '<p jay-coordinate="2">Footer</p>' +
                '</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const ProductComp = makeHydrateComponent();

        interface VS {
            pageTitle: string;
            footer: string;
        }

        const jayElement = ConstructContext.withHydrationRootContext<VS, {}>(
            { pageTitle: 'Title', footer: 'Footer' },
            refManager,
            root,
            () =>
                adoptElement<VS>('0', {}, [
                    adoptText<VS>('1', (vs) => vs.pageTitle),
                    childCompHydrate(ProductComp, (_vs: VS) => ({}), 'S1/0'),
                    adoptText<VS>('2', (vs) => vs.footer),
                ]),
        );

        // Parent coordinates before and after childCompHydrate should work
        const title = root.querySelector('[jay-coordinate="1"]');
        expect(title!.textContent).toBe('Title');
        const footer = root.querySelector('[jay-coordinate="2"]');
        expect(footer!.textContent).toBe('Footer');

        // Update should work for parent-level text
        jayElement.update({ pageTitle: 'New Title', footer: 'New Footer' });
        expect(title!.textContent).toBe('New Title');
        expect(footer!.textContent).toBe('New Footer');
    });

    it('works inside hydrateForEach — each item gets correct coordinate scope', () => {
        interface ListViewState {
            items: Array<{ id: string }>;
        }

        // SSR HTML: two forEach items, each containing a headless instance.
        // All items share jay-coordinate="0/0". Each item's article uses scope S2.
        const html =
            '<ul jay-coordinate="0">' +
            '<li jay-coordinate="0/0">' +
            '<article jay-coordinate="S2/0">' +
            '<span jay-coordinate="S2/1">Item A</span>' +
            '<span jay-coordinate="S2/2">10</span>' +
            '</article>' +
            '</li>' +
            '<li jay-coordinate="0/0">' +
            '<article jay-coordinate="S2/0">' +
            '<span jay-coordinate="S2/1">Item B</span>' +
            '<span jay-coordinate="S2/2">20</span>' +
            '</article>' +
            '</li>' +
            '</ul>';

        // Component adopts using S2/* (its local scope within each forEach item)
        const preRender = (options?: any) => {
            const [rm] = ReferencesManager.for(options, [], [], [], []);
            const render = (viewState: ProductViewState) =>
                ConstructContext.withHydrationChildContext<ProductViewState, {}>(
                    viewState,
                    rm,
                    () =>
                        adoptElement<ProductViewState>('S2/0', {}, [
                            adoptText<ProductViewState>('S2/1', (vs) => vs.name),
                            adoptText<ProductViewState>('S2/2', (vs) => vs.price),
                        ]),
                );
            return [rm.getPublicAPI(), render] as any;
        };
        const ProductComp = makeJayComponent(preRender, ((_p: any, _r: any) => ({
            render: () => ({ name: 'Test', price: 99 }),
        })) as any);

        const { root } = hydrate<ListViewState>(html, { items: [{ id: 'a' }, { id: 'b' }] }, () =>
            adoptDynamicElement<ListViewState>('0', {}, [
                hydrateForEach<ListViewState, { id: string }>(
                    (vs) => vs.items,
                    'id',
                    '0/0',
                    () => [childCompHydrate(ProductComp, (_item: { id: string }) => ({}), 'S2/0')],
                    (_item, _id) =>
                        e('li', {}, [e('article', {}, [dt((_i: { id: string }) => 'new')])]),
                ),
            ]),
        );

        // Each item's headless instance should adopt the correct elements
        const spans = root.querySelectorAll('[jay-coordinate="S2/1"]');
        expect(spans.length).toBe(2);
        expect(spans[0].textContent).toBe('Item A');
        expect(spans[1].textContent).toBe('Item B');
    });

    it('works inside hydrateConditional — adopts when condition is true at SSR', () => {
        interface ConditionalViewState {
            showProduct: boolean;
        }

        // SSR HTML: conditional rendered as true, headless instance inside
        const html =
            '<div jay-coordinate="0">' +
            '<article jay-coordinate="S1/0">' +
            '<span jay-coordinate="S1/1">Visible</span>' +
            '<span jay-coordinate="S1/2">50</span>' +
            '</article>' +
            '</div>';

        const ProductComp = makeHydrateComponent();

        const { jayElement, root } = hydrate<ConditionalViewState>(
            html,
            { showProduct: true },
            () =>
                adoptDynamicElement<ConditionalViewState>('0', {}, [
                    hydrateConditional<ConditionalViewState>(
                        (vs) => vs.showProduct,
                        () =>
                            childCompHydrate(
                                ProductComp,
                                (_vs: ConditionalViewState) => ({}),
                                'S1/0',
                            ),
                    ),
                ]),
        );

        const container = root.querySelector('[jay-coordinate="0"]')!;

        // Should adopt the SSR element
        expect(container.querySelector('[jay-coordinate="S1/1"]')).toBeTruthy();
        expect(container.querySelector('[jay-coordinate="S1/1"]')!.textContent).toBe('Visible');

        // Toggle condition to false — element should be removed from container
        jayElement.update({ showProduct: false });
        expect(container.querySelector('[jay-coordinate="S1/0"]')).toBeNull();

        // Toggle back to true — element should be re-inserted
        jayElement.update({ showProduct: true });
        expect(container.querySelector('[jay-coordinate="S1/0"]')).toBeTruthy();
    });
});
