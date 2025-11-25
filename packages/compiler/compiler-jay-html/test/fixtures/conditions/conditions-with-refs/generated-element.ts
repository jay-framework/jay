import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
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

export function render(options?: RenderElementOptions): ConditionsWithRefsElementPreRender {
    const [refManager, [refText1, refText2]] = ReferencesManager.for(
        options,
        ['text1', 'text2'],
        [],
        [],
        [],
    );
    const render = (viewState: ConditionsWithRefsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                c(
                    (vs) => vs.cond,
                    () =>
                        e(
                            'div',
                            { style: { cssText: 'color:red' } },
                            [dt((vs) => vs.text1)],
                            refText1(),
                        ),
                ),
                c(
                    (vs) => !vs.cond,
                    () =>
                        e('div', { style: { cssText: 'color:green' } }, [
                            e('span', {}, [dt((vs) => vs.text2)], refText2()),
                        ]),
                ),
            ]),
        ) as ConditionsWithRefsElement;
    return [refManager.getPublicAPI() as ConditionsWithRefsElementRefs, render];
}
