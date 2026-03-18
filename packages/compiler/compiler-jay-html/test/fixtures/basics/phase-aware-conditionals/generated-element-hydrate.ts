import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
    STATIC,
} from '@jay-framework/runtime';

export interface PhaseAwareConditionalsViewState {
    slowFlag: boolean;
    fastFlag: boolean;
    interactiveFlag: boolean;
}

export interface PhaseAwareConditionalsElementRefs {}

export type PhaseAwareConditionalsSlowViewState = Pick<PhaseAwareConditionalsViewState, 'slowFlag'>;

export type PhaseAwareConditionalsFastViewState = Pick<
    PhaseAwareConditionalsViewState,
    'fastFlag' | 'interactiveFlag'
>;

export type PhaseAwareConditionalsInteractiveViewState = Pick<
    PhaseAwareConditionalsViewState,
    'interactiveFlag'
>;

export type PhaseAwareConditionalsElement = JayElement<
    PhaseAwareConditionalsViewState,
    PhaseAwareConditionalsElementRefs
>;
export type PhaseAwareConditionalsElementRender = RenderElement<
    PhaseAwareConditionalsViewState,
    PhaseAwareConditionalsElementRefs,
    PhaseAwareConditionalsElement
>;
export type PhaseAwareConditionalsElementPreRender = [
    PhaseAwareConditionalsElementRefs,
    PhaseAwareConditionalsElementRender,
];
export type PhaseAwareConditionalsContract = JayContract<
    PhaseAwareConditionalsViewState,
    PhaseAwareConditionalsElementRefs,
    PhaseAwareConditionalsSlowViewState,
    PhaseAwareConditionalsFastViewState,
    PhaseAwareConditionalsInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PhaseAwareConditionalsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PhaseAwareConditionalsViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                STATIC,
                STATIC,
                hydrateConditional(
                    (vs) => vs.interactiveFlag,
                    () => adoptElement('0/2', {}, []),
                    () => e('span', {}, ['Interactive']),
                ),
                hydrateConditional(
                    (vs) => vs.interactiveFlag,
                    () => adoptElement('0/3', {}, []),
                    () => e('span', {}, ['Mixed']),
                ),
            ]),
        ) as PhaseAwareConditionalsElement;
    return [refManager.getPublicAPI() as PhaseAwareConditionalsElementRefs, render];
}
