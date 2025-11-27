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

export interface Composite2ViewState {
    title: string;
    subtitle: string;
    article: string;
}

export interface Composite2ElementRefs {}

export type Composite2SlowViewState = {};
export type Composite2FastViewState = {};
export type Composite2InteractiveViewState = Composite2ViewState;

export type Composite2Element = JayElement<Composite2ViewState, Composite2ElementRefs>;
export type Composite2ElementRender = RenderElement<
    Composite2ViewState,
    Composite2ElementRefs,
    Composite2Element
>;
export type Composite2ElementPreRender = [Composite2ElementRefs, Composite2ElementRender];
export type Composite2Contract = JayContract<
    Composite2ViewState,
    Composite2ElementRefs,
    Composite2SlowViewState,
    Composite2FastViewState,
    Composite2InteractiveViewState
>;

export function render(options?: RenderElementOptions): Composite2ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: Composite2ViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('section', {}, [
                    e('div', {}, [dt((vs) => vs.subtitle)]),
                    e('div', {}, [dt((vs) => vs.article)]),
                ]),
            ]),
        ) as Composite2Element;
    return [refManager.getPublicAPI() as Composite2ElementRefs, render];
}
