import {
    JayElement,
    element as e,
    dynamicText as dt,
    ConstructContext,
    RenderElementOptions, ReferencesManager, RenderElement,
} from 'jay-runtime';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export type CompositeElement = JayElement<CompositeViewState, CompositeElementRefs>;
export type CompositeElementRender = RenderElement<CompositeViewState, CompositeElementRefs, CompositeElement>
export type CompositeElementPreRender = [refs: CompositeElementRefs, CompositeElementRender]

export function render(
    options?: RenderElementOptions,
): CompositeElementPreRender {
    const [refManager, []] =
        ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: CompositeViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.text)]),
                e('div', {}, ['static']),
                e('div', {}, [dt((vs) => vs.text2)]),
            ]),
    ) as CompositeElement;
    return [refManager.getPublicAPI() as CompositeElementRefs, render]
}
