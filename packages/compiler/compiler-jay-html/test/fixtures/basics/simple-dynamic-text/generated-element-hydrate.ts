import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): SimpleDynamicTextElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SimpleDynamicTextViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [adoptText('1', (vs) => vs.s1)]),
        ) as SimpleDynamicTextElement;
    return [refManager.getPublicAPI() as SimpleDynamicTextElementRefs, render];
}
