import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateConditional,
} from '@jay-framework/runtime';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export type ConditionsSlowViewState = {};
export type ConditionsFastViewState = {};
export type ConditionsInteractiveViewState = ConditionsViewState;

export type ConditionsElement = JayElement<ConditionsViewState, ConditionsElementRefs>;
export type ConditionsElementRender = RenderElement<
    ConditionsViewState,
    ConditionsElementRefs,
    ConditionsElement
>;
export type ConditionsElementPreRender = [ConditionsElementRefs, ConditionsElementRender];
export type ConditionsContract = JayContract<
    ConditionsViewState,
    ConditionsElementRefs,
    ConditionsSlowViewState,
    ConditionsFastViewState,
    ConditionsInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ConditionsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ConditionsViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                hydrateConditional(
                    (vs) => vs.cond,
                    () => adoptText('0/1', (vs) => vs.text1),
                    () => e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text1)]),
                ),
                hydrateConditional(
                    (vs) => !vs.cond,
                    () => adoptText('0/2', (vs) => vs.text2),
                    () => e('div', { style: { cssText: 'color:green' } }, [dt((vs) => vs.text2)]),
                ),
            ]),
        ) as ConditionsElement;
    return [refManager.getPublicAPI() as ConditionsElementRefs, render];
}
