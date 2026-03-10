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
export type PageWithFullyStaticSlowForeachFastViewState = {};
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
            adoptElement('0', {}, [adoptText('1', (vs) => vs.pageTitle)]),
        ) as PageWithFullyStaticSlowForeachElement;
    return [refManager.getPublicAPI() as PageWithFullyStaticSlowForeachElementRefs, render];
}
