import {
    JayElement,
    element as e,
    dynamicText as dt,
    ConstructContext,
    RenderElement,
    ReferencesManager,
    RenderElementOptions,
} from 'jay-runtime';

export interface BasicViewState {
    text: string;
}

export interface BasicElementRefs {}

export type BasicElement = JayElement<BasicViewState, BasicElementRefs>;
type BasicElementRender = RenderElement<BasicViewState, BasicElementRefs, BasicElement>;
type BasicElementPreRender = [refs: BasicElementRefs, BasicElementRender];

export function render(options?: RenderElementOptions): BasicElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: BasicViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [e('div', {}, [dt((vs) => vs.text)])]),
        ) as BasicElement;
    return [refManager.getPublicAPI() as BasicElementRefs, render];
}
