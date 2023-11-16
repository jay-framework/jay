import { JayElement } from 'jay-runtime';
import { elementBridge } from 'jay-secure';

export interface EmptyElementViewState {}

export interface EmptyElementElementRefs {}

export type EmptyElementElement = JayElement<EmptyElementViewState, EmptyElementElementRefs>;

export function render(viewState: EmptyElementViewState): EmptyElementElement {
    return elementBridge(viewState, () => []);
}
