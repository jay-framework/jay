import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicHtml as dh,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
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

export function render(options?: RenderElementOptions): HtmlStringBindingElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: HtmlStringBindingViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('div', { class: 'content' }, [dh((vs) => vs.richContent)]),
            ]),
        ) as HtmlStringBindingElement;
    return [refManager.getPublicAPI() as HtmlStringBindingElementRefs, render];
}
