import {
    JayElement,
    dynamicHtml as dh,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface HtmlStringBindingViewState {
    title: string;
    richContent: string;
}

export interface HtmlStringBindingElementRefs {}

export type HtmlStringBindingSlowViewState = {};
export type HtmlStringBindingFastViewState = HtmlStringBindingViewState;
export type HtmlStringBindingInteractiveViewState = HtmlStringBindingViewState;

export type HtmlStringBindingElement = JayElement<
    HtmlStringBindingViewState,
    HtmlStringBindingElementRefs
>;
export type HtmlStringBindingElementRender = RenderElement<
    HtmlStringBindingViewState,
    HtmlStringBindingElementRefs,
    HtmlStringBindingElement
>;
export type HtmlStringBindingElementPreRender = [
    HtmlStringBindingElementRefs,
    HtmlStringBindingElementRender,
];
export type HtmlStringBindingContract = JayContract<
    HtmlStringBindingViewState,
    HtmlStringBindingElementRefs,
    HtmlStringBindingSlowViewState,
    HtmlStringBindingFastViewState,
    HtmlStringBindingInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): HtmlStringBindingElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: HtmlStringBindingViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                adoptElement('S0/0/1', {}, [dh((vs) => vs.richContent)]),
            ]),
        ) as HtmlStringBindingElement;
    return [refManager.getPublicAPI() as HtmlStringBindingElementRefs, render];
}
