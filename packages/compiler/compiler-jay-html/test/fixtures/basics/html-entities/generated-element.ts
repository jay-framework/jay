import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface HtmlEntitiesViewState {
    s1: string;
}

export interface HtmlEntitiesElementRefs {}

export type HtmlEntitiesSlowViewState = {};
export type HtmlEntitiesFastViewState = HtmlEntitiesViewState;
export type HtmlEntitiesInteractiveViewState = HtmlEntitiesViewState;

export type HtmlEntitiesElement = JayElement<HtmlEntitiesViewState, HtmlEntitiesElementRefs>;
export type HtmlEntitiesElementRender = RenderElement<
    HtmlEntitiesViewState,
    HtmlEntitiesElementRefs,
    HtmlEntitiesElement
>;
export type HtmlEntitiesElementPreRender = [HtmlEntitiesElementRefs, HtmlEntitiesElementRender];
export type HtmlEntitiesContract = JayContract<
    HtmlEntitiesViewState,
    HtmlEntitiesElementRefs,
    HtmlEntitiesSlowViewState,
    HtmlEntitiesFastViewState,
    HtmlEntitiesInteractiveViewState
>;

export function render(options?: RenderElementOptions): HtmlEntitiesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: HtmlEntitiesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('button', {}, ['×']),
                e('span', {}, ['& < >']),
                e('div', {}, [dt((vs) => `${vs.s1} — footer`)]),
            ]),
        ) as HtmlEntitiesElement;
    return [refManager.getPublicAPI() as HtmlEntitiesElementRefs, render];
}
