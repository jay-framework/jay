import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export type CompositeSlowViewState = {};
export type CompositeFastViewState = {};
export type CompositeInteractiveViewState = CompositeViewState;

export type CompositeElement = JayElement<CompositeViewState, CompositeElementRefs>;
export type CompositeElementRender = RenderElement<
    CompositeViewState,
    CompositeElementRefs,
    CompositeElement
>;
export type CompositeElementPreRender = [CompositeElementRefs, CompositeElementRender];
export type CompositeContract = JayContract<
    CompositeViewState,
    CompositeElementRefs,
    CompositeSlowViewState,
    CompositeFastViewState,
    CompositeInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): CompositeElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: CompositeViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.text),
                adoptText('0/2', (vs) => vs.text2),
            ]),
        ) as CompositeElement;
    return [refManager.getPublicAPI() as CompositeElementRefs, render];
}
