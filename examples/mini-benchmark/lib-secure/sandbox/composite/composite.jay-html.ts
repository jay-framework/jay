import { JayElement } from 'jay-runtime';
import { elementBridge } from 'jay-secure';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export type CompositeElement = JayElement<CompositeViewState, CompositeElementRefs>;

export function render(viewState: CompositeViewState): CompositeElement {
    return elementBridge(viewState, () => []);
}
