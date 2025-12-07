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

export interface SimpleViewState {
    title: string;
    content: string;
}

export interface SimpleElementRefs {}

export type SimpleSlowViewState = {};
export type SimpleFastViewState = {};
export type SimpleInteractiveViewState = SimpleViewState;

export type SimpleElement = JayElement<SimpleViewState, SimpleElementRefs>;
export type SimpleElementRender = RenderElement<SimpleViewState, SimpleElementRefs, SimpleElement>;
export type SimpleElementPreRender = [SimpleElementRefs, SimpleElementRender];
export type SimpleContract = JayContract<
    SimpleViewState,
    SimpleElementRefs,
    SimpleSlowViewState,
    SimpleFastViewState,
    SimpleInteractiveViewState
>;

export function render(options?: RenderElementOptions): SimpleElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SimpleViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('p', {}, [dt((vs) => vs.content)]),
            ]),
        ) as SimpleElement;
    return [refManager.getPublicAPI() as SimpleElementRefs, render];
}
