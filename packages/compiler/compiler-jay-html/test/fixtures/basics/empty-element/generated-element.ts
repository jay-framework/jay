import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface EmptyElementViewState {}

export interface EmptyElementElementRefs {}

export type EmptyElementElement = JayElement<EmptyElementViewState, EmptyElementElementRefs>;
export type EmptyElementElementRender = RenderElement<
    EmptyElementViewState,
    EmptyElementElementRefs,
    EmptyElementElement
>;
export type EmptyElementElementPreRender = [EmptyElementElementRefs, EmptyElementElementRender];
export type EmptyElementContract = JayContract<EmptyElementViewState, EmptyElementElementRefs>;

export function render(options?: RenderElementOptions): EmptyElementElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: EmptyElementViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [e('div', { attr: 'value' }, [])]),
        ) as EmptyElementElement;
    return [refManager.getPublicAPI() as EmptyElementElementRefs, render];
}
