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

export interface PhaseAwareDynamicTextViewState {
    title: string;
    fastCount: number;
    interactiveCount: number;
}

export interface PhaseAwareDynamicTextElementRefs {}

export type PhaseAwareDynamicTextSlowViewState = Pick<PhaseAwareDynamicTextViewState, 'title'>;

export type PhaseAwareDynamicTextFastViewState = Pick<
    PhaseAwareDynamicTextViewState,
    'fastCount' | 'interactiveCount'
>;

export type PhaseAwareDynamicTextInteractiveViewState = Pick<
    PhaseAwareDynamicTextViewState,
    'interactiveCount'
>;

export type PhaseAwareDynamicTextElement = JayElement<
    PhaseAwareDynamicTextViewState,
    PhaseAwareDynamicTextElementRefs
>;
export type PhaseAwareDynamicTextElementRender = RenderElement<
    PhaseAwareDynamicTextViewState,
    PhaseAwareDynamicTextElementRefs,
    PhaseAwareDynamicTextElement
>;
export type PhaseAwareDynamicTextElementPreRender = [
    PhaseAwareDynamicTextElementRefs,
    PhaseAwareDynamicTextElementRender,
];
export type PhaseAwareDynamicTextContract = JayContract<
    PhaseAwareDynamicTextViewState,
    PhaseAwareDynamicTextElementRefs,
    PhaseAwareDynamicTextSlowViewState,
    PhaseAwareDynamicTextFastViewState,
    PhaseAwareDynamicTextInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PhaseAwareDynamicTextElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PhaseAwareDynamicTextViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/2', (vs) => `Interactive Count: ${vs.interactiveCount}`),
            ]),
        ) as PhaseAwareDynamicTextElement;
    return [refManager.getPublicAPI() as PhaseAwareDynamicTextElementRefs, render];
}
