import {
    JayElement,
    element as e,
    dynamicText as dt,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export type ConditionsElement = JayElement<ConditionsViewState, ConditionsElementRefs>;

export function render(
    viewState: ConditionsViewState,
    options?: RenderElementOptions,
): ConditionsElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            de('div', {}, [
                c(
                    (vs) => vs.cond,
                    e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text1)]),
                ),
                c(
                    (vs) => !vs.cond,
                    e('div', { style: { cssText: 'color:green' } }, [dt((vs) => vs.text2)]),
                ),
            ]),
        options,
    );
}
