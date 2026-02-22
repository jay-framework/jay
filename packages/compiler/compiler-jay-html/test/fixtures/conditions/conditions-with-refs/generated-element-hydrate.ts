import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateConditional,
} from '@jay-framework/runtime';

export interface ConditionsWithRefsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRefsElementRefs {
    text1: HTMLElementProxy<ConditionsWithRefsViewState, HTMLDivElement>;
    text2: HTMLElementProxy<ConditionsWithRefsViewState, HTMLSpanElement>;
}

export type ConditionsWithRefsSlowViewState = {};
export type ConditionsWithRefsFastViewState = {};
export type ConditionsWithRefsInteractiveViewState = ConditionsWithRefsViewState;

export type ConditionsWithRefsElement = JayElement<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs
>;
export type ConditionsWithRefsElementRender = RenderElement<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs,
    ConditionsWithRefsElement
>;
export type ConditionsWithRefsElementPreRender = [
    ConditionsWithRefsElementRefs,
    ConditionsWithRefsElementRender,
];
export type ConditionsWithRefsContract = JayContract<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs,
    ConditionsWithRefsSlowViewState,
    ConditionsWithRefsFastViewState,
    ConditionsWithRefsInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ConditionsWithRefsElementPreRender {
    const [refManager, [refText1, refText2]] = ReferencesManager.for(
        options,
        ['text1', 'text2'],
        [],
        [],
        [],
    );
    const render = (viewState: ConditionsWithRefsViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptElement('1', {}, [
                    hydrateConditional(
                        (vs) => vs.cond,
                        () => adoptText('2', (vs) => vs.text1, refText1()),
                    ),
                    hydrateConditional(
                        (vs) => !vs.cond,
                        () => adoptText('text2', (vs) => vs.text2, refText2()),
                    ),
                ]),
            ]),
        ) as ConditionsWithRefsElement;
    return [refManager.getPublicAPI() as ConditionsWithRefsElementRefs, render];
}
