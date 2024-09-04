import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';

export interface DynamicTextInputTypesViewState {
    n1: number;
    n2: number;
}

export interface DynamicTextInputTypesElementRefs {}

export type DynamicTextInputTypesElement = JayElement<
    DynamicTextInputTypesViewState,
    DynamicTextInputTypesElementRefs
>;
export type DynamicTextInputTypesElementRender = RenderElement<
    DynamicTextInputTypesViewState,
    DynamicTextInputTypesElementRefs,
    DynamicTextInputTypesElement
>;
export type DynamicTextInputTypesElementPreRender = [
    refs: DynamicTextInputTypesElementRefs,
    DynamicTextInputTypesElementRender,
];

export function render(options?: RenderElementOptions): DynamicTextInputTypesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: DynamicTextInputTypesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.n1)]),
                e('div', {}, [dt((vs) => `${vs.n1} + ${vs.n2}`)]),
            ]),
        ) as DynamicTextInputTypesElement;
    return [refManager.getPublicAPI() as DynamicTextInputTypesElementRefs, render];
}
