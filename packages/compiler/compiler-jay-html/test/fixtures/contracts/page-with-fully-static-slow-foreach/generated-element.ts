import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    slowForEachItem,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ProductOfPageWithFullyStaticSlowForeachViewState {
    _id: string;
}

export interface PageWithFullyStaticSlowForeachViewState {
    pageTitle: string;
    products: Array<ProductOfPageWithFullyStaticSlowForeachViewState>;
}

export interface PageWithFullyStaticSlowForeachElementRefs {}

export type PageWithFullyStaticSlowForeachSlowViewState = {};
export type PageWithFullyStaticSlowForeachFastViewState = PageWithFullyStaticSlowForeachViewState;
export type PageWithFullyStaticSlowForeachInteractiveViewState =
    PageWithFullyStaticSlowForeachViewState;

export type PageWithFullyStaticSlowForeachElement = JayElement<
    PageWithFullyStaticSlowForeachViewState,
    PageWithFullyStaticSlowForeachElementRefs
>;
export type PageWithFullyStaticSlowForeachElementRender = RenderElement<
    PageWithFullyStaticSlowForeachViewState,
    PageWithFullyStaticSlowForeachElementRefs,
    PageWithFullyStaticSlowForeachElement
>;
export type PageWithFullyStaticSlowForeachElementPreRender = [
    PageWithFullyStaticSlowForeachElementRefs,
    PageWithFullyStaticSlowForeachElementRender,
];
export type PageWithFullyStaticSlowForeachContract = JayContract<
    PageWithFullyStaticSlowForeachViewState,
    PageWithFullyStaticSlowForeachElementRefs,
    PageWithFullyStaticSlowForeachSlowViewState,
    PageWithFullyStaticSlowForeachFastViewState,
    PageWithFullyStaticSlowForeachInteractiveViewState
>;

export function render(
    options?: RenderElementOptions,
): PageWithFullyStaticSlowForeachElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithFullyStaticSlowForeachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                de('div', { class: 'grid' }, [
                    slowForEachItem<
                        PageWithFullyStaticSlowForeachViewState,
                        ProductOfPageWithFullyStaticSlowForeachViewState
                    >(
                        (vs: PageWithFullyStaticSlowForeachViewState) => vs.products,
                        0,
                        'p1',
                        () => e('div', {}, [e('span', {}, ['Static Item A'])]),
                    ),
                    slowForEachItem<
                        PageWithFullyStaticSlowForeachViewState,
                        ProductOfPageWithFullyStaticSlowForeachViewState
                    >(
                        (vs: PageWithFullyStaticSlowForeachViewState) => vs.products,
                        1,
                        'p2',
                        () => e('div', {}, [e('span', {}, ['Static Item B'])]),
                    ),
                ]),
            ]),
        ) as PageWithFullyStaticSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithFullyStaticSlowForeachElementRefs, render];
}
