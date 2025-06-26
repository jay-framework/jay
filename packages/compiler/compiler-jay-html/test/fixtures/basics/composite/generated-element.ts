import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export type CompositeElement = JayElement<CompositeViewState, CompositeElementRefs>;
export type CompositeElementRender = RenderElement<
    CompositeViewState,
    CompositeElementRefs,
    CompositeElement
>;
export type CompositeElementPreRender = [CompositeElementRefs, CompositeElementRender];
export type CompositeContract = JayContract<CompositeViewState, CompositeElementRefs>;

export function render(options?: RenderElementOptions): CompositeElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: CompositeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.text)]),
                e('div', {}, ['static']),
                e('div', {}, [dt((vs) => vs.text2)]),
            ]),
        ) as CompositeElement;
    return [refManager.getPublicAPI() as CompositeElementRefs, render];
}
