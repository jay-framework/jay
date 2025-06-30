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

export interface ConditionsWithRepeatedRefViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRepeatedRefElementRefs {
    text1: HTMLElementProxy<ConditionsWithRepeatedRefViewState, HTMLDivElement>;
}

export type ConditionsWithRepeatedRefElement = JayElement<
    ConditionsWithRepeatedRefViewState,
    ConditionsWithRepeatedRefElementRefs
>;
export type ConditionsWithRepeatedRefElementRender = RenderElement<
    ConditionsWithRepeatedRefViewState,
    ConditionsWithRepeatedRefElementRefs,
    ConditionsWithRepeatedRefElement
>;
export type ConditionsWithRepeatedRefElementPreRender = [
    ConditionsWithRepeatedRefElementRefs,
    ConditionsWithRepeatedRefElementRender,
];
export type ConditionsWithRepeatedRefContract = JayContract<
    ConditionsWithRepeatedRefViewState,
    ConditionsWithRepeatedRefElementRefs
>;

export function render(options?: RenderElementOptions): ConditionsWithRepeatedRefElementPreRender {
    const [refManager, [refText1]] = ReferencesManager.for(options, ['text1'], [], [], []);
    const render = (viewState: ConditionsWithRepeatedRefViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                c(
                    (vs) => vs.cond,
                    () =>
                        e(
                            'div',
                            { style: { cssText: 'color:red' } },
                            [e('h1', {}, [dt((vs) => vs.text1)])],
                            refText1(),
                        ),
                ),
                c(
                    (vs) => !vs.cond,
                    () =>
                        e(
                            'div',
                            { style: { cssText: 'color:green' } },
                            [e('span', {}, [dt((vs) => vs.text2)])],
                            refText1(),
                        ),
                ),
            ]),
        ) as ConditionsWithRepeatedRefElement;
    return [refManager.getPublicAPI() as ConditionsWithRepeatedRefElementRefs, render];
}
