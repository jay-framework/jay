import {
    JayElement,
    RenderElement,
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithFullyStaticSlowForeachElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithFullyStaticSlowForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [adoptText('S0/0/0', (vs) => vs.pageTitle)]),
        ) as PageWithFullyStaticSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithFullyStaticSlowForeachElementRefs, render];
}
