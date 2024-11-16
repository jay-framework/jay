import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';

export enum Cond {
    one,
    two,
    three,
}

export interface ConditionsWithEnumViewState {
    text1: string;
    text2: string;
    text3: string;
    cond: Cond;
}

export interface ConditionsWithEnumElementRefs {}

export type ConditionsWithEnumElement = JayElement<
    ConditionsWithEnumViewState,
    ConditionsWithEnumElementRefs
>;
export type ConditionsWithEnumElementRender = RenderElement<
    ConditionsWithEnumViewState,
    ConditionsWithEnumElementRefs,
    ConditionsWithEnumElement
>;
export type ConditionsWithEnumElementPreRender = [
    ConditionsWithEnumElementRefs,
    ConditionsWithEnumElementRender,
];

export function render(options?: RenderElementOptions): ConditionsWithEnumElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ConditionsWithEnumViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                c(
                    (vs) => vs.cond === Cond.one,
                    e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text1)]),
                ),
                c(
                    (vs) => vs.cond === Cond.two,
                    e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text2)]),
                ),
                c(
                    (vs) => vs.cond !== Cond.one,
                    e('div', { style: { cssText: 'color:green' } }, [dt((vs) => vs.text3)]),
                ),
            ]),
        ) as ConditionsWithEnumElement;
    return [refManager.getPublicAPI() as ConditionsWithEnumElementRefs, render];
}
