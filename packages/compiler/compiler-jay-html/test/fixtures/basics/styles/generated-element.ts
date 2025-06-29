import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface StylesViewState {
    text1: string;
    text2: string;
}

export interface StylesElementRefs {}

export type StylesElement = JayElement<StylesViewState, StylesElementRefs>;
export type StylesElementRender = RenderElement<StylesViewState, StylesElementRefs, StylesElement>;
export type StylesElementPreRender = [StylesElementRefs, StylesElementRender];
export type StylesContract = JayContract<StylesViewState, StylesElementRefs>;

export function render(options?: RenderElementOptions): StylesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: StylesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', { style: { cssText: 'color:red' } }, [dt((vs) => vs.text1)]),
                e('div', { style: { cssText: 'color:green' } }, [dt((vs) => vs.text2)]),
            ]),
        ) as StylesElement;
    return [refManager.getPublicAPI() as StylesElementRefs, render];
}
