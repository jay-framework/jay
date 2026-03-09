import {
    ConstructContext,
    ReferencesManager,
    adoptElement,
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

    function makeHydrateComponent(coordinateKey: string) {
        const preRender = (options?: any) => {
            const [refManager] = ReferencesManager.for(options, [], [], [], []);
            const render = (viewState: ProductViewState) =>
                ConstructContext.withHydrationChildContext<ProductViewState, {}>(
                    viewState,
                    refManager,
                    () =>
                        adoptElement<ProductViewState>('0', {}, [
                            adoptText<ProductViewState>('1', (vs) => vs.name),
                            adoptText<ProductViewState>('2', (vs) => vs.price),
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
        const root = makeServerHTML(
            '<div jay-coordinate="0">' +
                '<h1 jay-coordinate="1">Page Title</h1>' +
                '<article jay-coordinate="product-card:0/0">' +
                '<span jay-coordinate="product-card:0/1">Widget</span>' +
                '<span jay-coordinate="product-card:0/2">99</span>' +
                '</article>' +
                '</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const ProductComp = makeHydrateComponent('product-card:0');

        const jayElement = ConstructContext.withHydrationRootContext<PageViewState, {}>(
            { pageTitle: 'Page Title' },
            refManager,
            root,
            () =>
                adoptElement<PageViewState>('0', {}, [
                    adoptText<PageViewState>('1', (vs) => vs.pageTitle),
                    childCompHydrate(
                        ProductComp,
                        (_vs: PageViewState) => ({}),
                        'product-card:0',
                    ),
                ]),
        );

        // The article element should be adopted (not created fresh)
        const article = root.querySelector('[jay-coordinate="product-card:0/0"]');
        expect(article).toBeTruthy();

        // Text nodes should be adopted and wired up
        const nameSpan = root.querySelector('[jay-coordinate="product-card:0/1"]');
        expect(nameSpan).toBeTruthy();
        expect(nameSpan!.textContent).toBe('Widget');
    });

    it('adopts correct elements with nested coordinate prefix (slowForEach)', () => {
        const root = makeServerHTML(
            '<div jay-coordinate="0">' +
                '<article jay-coordinate="p1/product-card:0/0">' +
                '<span jay-coordinate="p1/product-card:0/1">Item A</span>' +
                '<span jay-coordinate="p1/product-card:0/2">42</span>' +
                '</article>' +
                '</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const ProductComp = makeHydrateComponent('product-card:0');

        // childCompHydrate with multi-segment coordinate 'p1/product-card:0'
        // should resolve to 'p1/product-card:0/...'
        ConstructContext.withHydrationRootContext<PageViewState, {}>(
            { pageTitle: 'Page' },
            refManager,
            root,
            () =>
                adoptElement<PageViewState>('0', {}, [
                    childCompHydrate(
                        ProductComp,
                        (_vs: PageViewState) => ({}),
                        'p1/product-card:0',
                    ),
                ]),
        );

        // The article should be adopted via p1/product-card:0/0
        const article = root.querySelector('[jay-coordinate="p1/product-card:0/0"]');
        expect(article).toBeTruthy();
    });

    it('does not interfere with parent coordinate resolution', () => {
        const root = makeServerHTML(
            '<div jay-coordinate="0">' +
                '<h1 jay-coordinate="1">Title</h1>' +
                '<article jay-coordinate="product-card:0/0">' +
                '<span jay-coordinate="product-card:0/1">Widget</span>' +
                '<span jay-coordinate="product-card:0/2">99</span>' +
                '</article>' +
                '<p jay-coordinate="2">Footer</p>' +
                '</div>',
        );

        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        const ProductComp = makeHydrateComponent('product-card:0');

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
                    childCompHydrate(ProductComp, (_vs: VS) => ({}), 'product-card:0'),
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

        // SSR HTML: two forEach items, each containing a headless instance
        const html =
            '<ul jay-coordinate="0">' +
            '<li jay-coordinate="a">' +
            '<article jay-coordinate="a/product-card:0/0">' +
            '<span jay-coordinate="a/product-card:0/1">Item A</span>' +
            '<span jay-coordinate="a/product-card:0/2">10</span>' +
            '</article>' +
            '</li>' +
            '<li jay-coordinate="b">' +
            '<article jay-coordinate="b/product-card:0/0">' +
            '<span jay-coordinate="b/product-card:0/1">Item B</span>' +
            '<span jay-coordinate="b/product-card:0/2">20</span>' +
            '</article>' +
            '</li>' +
            '</ul>';

        const ProductComp = makeHydrateComponent('product-card:0');

        const { root } = hydrate<ListViewState>(
            html,
            { items: [{ id: 'a' }, { id: 'b' }] },
            () =>
                hydrateForEach<ListViewState, { id: string }>(
                    '0',
                    (vs) => vs.items,
                    'id',
                    () => [
                        childCompHydrate(
                            ProductComp,
                            (_item: { id: string }) => ({}),
                            'product-card:0',
                        ),
                    ],
                    (_item, _id) =>
                        e('li', {}, [
                            e('article', {}, [dt((_i: { id: string }) => 'new')]),
                        ]),
                ),
        );

        // Each item's headless instance should adopt the correct elements
        const itemAName = root.querySelector('[jay-coordinate="a/product-card:0/1"]');
        expect(itemAName).toBeTruthy();
        expect(itemAName!.textContent).toBe('Item A');

        const itemBName = root.querySelector('[jay-coordinate="b/product-card:0/1"]');
        expect(itemBName).toBeTruthy();
        expect(itemBName!.textContent).toBe('Item B');
    });

    it('works inside hydrateConditional — adopts when condition is true at SSR', () => {
        interface ConditionalViewState {
            showProduct: boolean;
        }

        // SSR HTML: conditional rendered as true, headless instance inside
        const html =
            '<div jay-coordinate="0">' +
            '<article jay-coordinate="product-card:0/0">' +
            '<span jay-coordinate="product-card:0/1">Visible</span>' +
            '<span jay-coordinate="product-card:0/2">50</span>' +
            '</article>' +
            '</div>';

        const ProductComp = makeHydrateComponent('product-card:0');

        const { jayElement, root } = hydrate<ConditionalViewState>(
            html,
            { showProduct: true },
            () =>
                adoptElement<ConditionalViewState>('0', {}, [
                    hydrateConditional<ConditionalViewState>(
                        (vs) => vs.showProduct,
                        () =>
                            childCompHydrate(
                                ProductComp,
                                (_vs: ConditionalViewState) => ({}),
                                'product-card:0',
                            ),
                    ),
                ]),
        );

        const container = root.querySelector('[jay-coordinate="0"]')!;

        // Should adopt the SSR element
        expect(container.querySelector('[jay-coordinate="product-card:0/1"]')).toBeTruthy();
        expect(
            container.querySelector('[jay-coordinate="product-card:0/1"]')!.textContent,
        ).toBe('Visible');

        // Toggle condition to false — element should be removed from container
        jayElement.update({ showProduct: false });
        expect(container.querySelector('[jay-coordinate="product-card:0/0"]')).toBeNull();

        // Toggle back to true — element should be re-inserted
        jayElement.update({ showProduct: true });
        expect(container.querySelector('[jay-coordinate="product-card:0/0"]')).toBeTruthy();
    });
});
