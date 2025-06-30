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
    JayContract,
} from '@jay-framework/runtime';

export enum CondOfConditionsWithEnumViewState {
    one,
    two,
    three,
}

export interface ConditionsWithEnumViewState {
    text1: string;
    text2: string;
    text3: string;
    cond: CondOfConditionsWithEnumViewState;
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
export type ConditionsWithEnumContract = JayContract<
    ConditionsWithEnumViewState,
    ConditionsWithEnumElementRefs
>;

export function render(options?: RenderElementOptions): ConditionsWithEnumElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ConditionsWithEnumViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                c(
                    (vs) => vs.cond === CondOfConditionsWithEnumViewState.one,
                    () => e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text1)]),
                ),
                c(
                    (vs) => vs.cond === CondOfConditionsWithEnumViewState.two,
                    () => e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text2)]),
                ),
                c(
                    (vs) => vs.cond !== CondOfConditionsWithEnumViewState.one,
                    () => e('div', { style: { cssText: 'color:green' } }, [dt((vs) => vs.text3)]),
                ),
            ]),
        ) as ConditionsWithEnumElement;
    return [refManager.getPublicAPI() as ConditionsWithEnumElementRefs, render];
}
