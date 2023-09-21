import { JayElement, RenderElementOptions } from 'jay-runtime';

export interface BasicViewState {
    text: string;
}

export interface BasicElementRefs {}

export type BasicElement = JayElement<BasicViewState, BasicElementRefs>;

export declare function render(
    viewState: BasicViewState,
    options?: RenderElementOptions,
): BasicElement;
