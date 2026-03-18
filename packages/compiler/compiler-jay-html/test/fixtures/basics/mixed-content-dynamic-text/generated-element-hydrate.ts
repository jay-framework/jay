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

export interface MixedContentDynamicTextViewState {
    count: number;
}

export interface MixedContentDynamicTextElementRefs {}

export type MixedContentDynamicTextSlowViewState = {};
export type MixedContentDynamicTextFastViewState = MixedContentDynamicTextViewState;
export type MixedContentDynamicTextInteractiveViewState = MixedContentDynamicTextViewState;

export type MixedContentDynamicTextElement = JayElement<
    MixedContentDynamicTextViewState,
    MixedContentDynamicTextElementRefs
>;
export type MixedContentDynamicTextElementRender = RenderElement<
    MixedContentDynamicTextViewState,
    MixedContentDynamicTextElementRefs,
    MixedContentDynamicTextElement
>;
export type MixedContentDynamicTextElementPreRender = [
    MixedContentDynamicTextElementRefs,
    MixedContentDynamicTextElementRender,
];
export type MixedContentDynamicTextContract = JayContract<
    MixedContentDynamicTextViewState,
    MixedContentDynamicTextElementRefs,
    MixedContentDynamicTextSlowViewState,
    MixedContentDynamicTextFastViewState,
    MixedContentDynamicTextInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): MixedContentDynamicTextElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: MixedContentDynamicTextViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [adoptText('0', (vs) => `Count: ${vs.count} `, undefined, 0)]),
        ) as MixedContentDynamicTextElement;
    return [refManager.getPublicAPI() as MixedContentDynamicTextElementRefs, render];
}
