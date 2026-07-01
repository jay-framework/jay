import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
} from '@jay-framework/runtime';

export interface ConditionsWithStaticSiblingViewState {
    count: number;
    showContent: boolean;
}

export interface ConditionsWithStaticSiblingElementRefs {}

export type ConditionsWithStaticSiblingSlowViewState = {};
export type ConditionsWithStaticSiblingFastViewState = ConditionsWithStaticSiblingViewState;
export type ConditionsWithStaticSiblingInteractiveViewState = ConditionsWithStaticSiblingViewState;

export type ConditionsWithStaticSiblingElement = JayElement<
    ConditionsWithStaticSiblingViewState,
    ConditionsWithStaticSiblingElementRefs
>;
export type ConditionsWithStaticSiblingElementRender = RenderElement<
    ConditionsWithStaticSiblingViewState,
    ConditionsWithStaticSiblingElementRefs,
    ConditionsWithStaticSiblingElement
>;
export type ConditionsWithStaticSiblingElementPreRender = [
    ConditionsWithStaticSiblingElementRefs,
    ConditionsWithStaticSiblingElementRender,
];
export type ConditionsWithStaticSiblingContract = JayContract<
    ConditionsWithStaticSiblingViewState,
    ConditionsWithStaticSiblingElementRefs,
    ConditionsWithStaticSiblingSlowViewState,
    ConditionsWithStaticSiblingFastViewState,
    ConditionsWithStaticSiblingInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ConditionsWithStaticSiblingElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ConditionsWithStaticSiblingViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptElement('S0/0/0', {}, [adoptText('S0/0/0/1', (vs) => `${vs.count} items`)]),
                hydrateConditional(
                    (vs) => vs.showContent,
                    () => adoptElement('S0/0/1', {}, []),
                    () => e('div', {}, ['content here']),
                ),
                adoptElement('S0/0/2', {}, []),
            ]),
        ) as ConditionsWithStaticSiblingElement;
    return [refManager.getPublicAPI() as ConditionsWithStaticSiblingElementRefs, render];
}
