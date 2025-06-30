import {
    JayElement,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
} from '@jay-framework/runtime';

export interface ChildViewState {
    textFromProp: string;
    textFromAPI: string;
    id: string;
}

export interface ChildElementRefs {
    eventToParent: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
    eventToParentToChildProp: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
    eventToParentToChildApi: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>;
export type ChildElementRender = RenderElement<ChildViewState, ChildElementRefs, ChildElement>;
export type ChildElementPreRender = [refs: ChildElementRefs, ChildElementRender];

export declare function render(options?: RenderElementOptions): ChildElementPreRender;
