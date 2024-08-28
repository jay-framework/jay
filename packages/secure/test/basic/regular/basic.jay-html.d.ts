import {JayElement, RenderElement, RenderElementOptions} from 'jay-runtime';

export interface BasicViewState {
    text: string;
}

export interface BasicElementRefs {}

export type BasicElement = JayElement<BasicViewState, BasicElementRefs>;
export type BasicElementRender = RenderElement<BasicViewState, BasicElementRefs, BasicElement>
export type BasicElementPreRender = [refs: BasicElementRefs, BasicElementRender]

export declare function render(
    viewState: BasicViewState,
    options?: RenderElementOptions,
): BasicElementPreRender;
