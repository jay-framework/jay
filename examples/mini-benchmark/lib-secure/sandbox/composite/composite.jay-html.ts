import {JayElement, RenderElement} from 'jay-runtime';
import {elementBridge, SecureReferencesManager} from 'jay-secure';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export type CompositeElement = JayElement<CompositeViewState, CompositeElementRefs>;
export type CompositeElementRender = RenderElement<CompositeViewState, CompositeElementRefs, CompositeElement>
export type CompositeElementPreRender = [refs: CompositeElementRefs, CompositeElementRender]

export function render(): CompositeElementPreRender {
    const [refManager, []] =
        SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: CompositeViewState) =>  elementBridge(viewState, refManager, () => []);
    return [refManager.getPublicAPI() as CompositeElementRefs, render]
}
