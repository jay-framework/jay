import {
    JayElement,
    element as e,
    dynamicText as dt,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    HTMLElementProxy,
    elemRef as er,
    RenderElementOptions,
} from 'jay-runtime';

export interface ConditionsWithRefsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRefsElementRefs {
    text1: HTMLElementProxy<ConditionsWithRefsViewState, HTMLDivElement>;
    text2: HTMLElementProxy<ConditionsWithRefsViewState, HTMLSpanElement>;
}

export type ConditionsWithRefsElement = JayElement<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs
>;

export function render(
    viewState: ConditionsWithRefsViewState,
    options?: RenderElementOptions,
): ConditionsWithRefsElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            de('div', {}, [
                c(
                    (vs) => vs.cond,
                    e(
                        'div',
                        { style: { cssText: 'color:red' } },
                        [dt((vs) => vs.text1)],
                        er('text1'),
                    ),
                ),
                c(
                    (vs) => !vs.cond,
                    e('div', { style: { cssText: 'color:green' } }, [
                        e('span', {}, [dt((vs) => vs.text2)], er('text2')),
                    ]),
                ),
            ]),
        options,
    );
}
