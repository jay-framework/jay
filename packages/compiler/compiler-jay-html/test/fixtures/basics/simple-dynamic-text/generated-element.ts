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

export interface SimpleDynamicTextViewState {
    s1: string;
}

export interface SimpleDynamicTextElementRefs {}

export type SimpleDynamicTextSlowViewState = {};
export type SimpleDynamicTextFastViewState = {};
export type SimpleDynamicTextInteractiveViewState = SimpleDynamicTextViewState;

export type SimpleDynamicTextElement = JayElement<
    SimpleDynamicTextViewState,
    SimpleDynamicTextElementRefs
>;
export type SimpleDynamicTextElementRender = RenderElement<
    SimpleDynamicTextViewState,
    SimpleDynamicTextElementRefs,
    SimpleDynamicTextElement
>;
export type SimpleDynamicTextElementPreRender = [
    SimpleDynamicTextElementRefs,
    SimpleDynamicTextElementRender,
];
export type SimpleDynamicTextContract = JayContract<
    SimpleDynamicTextViewState,
    SimpleDynamicTextElementRefs,
    SimpleDynamicTextSlowViewState,
    SimpleDynamicTextFastViewState,
    SimpleDynamicTextInteractiveViewState
>;

export function render(options?: RenderElementOptions): SimpleDynamicTextElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SimpleDynamicTextViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [dt((vs) => vs.s1)]),
        ) as SimpleDynamicTextElement;
    return [refManager.getPublicAPI() as SimpleDynamicTextElementRefs, render];
}
