import {
    JayElement,
    element as e,
    dynamicText as dt,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    RenderElementOptions,
    ReferencesManager,
    RenderElement,
} from 'jay-runtime';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export type ConditionsElement = JayElement<ConditionsViewState, ConditionsElementRefs>;
export type ConditionsElementRender = RenderElement<
    ConditionsViewState,
    ConditionsElementRefs,
    ConditionsElement
>;
export type ConditionsElementPreRender = [refs: ConditionsElementRefs, ConditionsElementRender];

export function render(options?: RenderElementOptions): ConditionsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ConditionsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
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
        ) as ConditionsElement;
    return [refManager.getPublicAPI() as ConditionsElementRefs, render];
}
