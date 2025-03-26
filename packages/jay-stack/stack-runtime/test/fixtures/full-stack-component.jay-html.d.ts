import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';

export interface FSComponentViewState {
    id: string;
    name: string;
    age: number;
    address: string;
    stars: number;
    rating: number;
}

export interface FSComponentElementRefs {}

export type FSComponentElement = JayElement<FSComponentViewState, FSComponentElementRefs>;
export type FSComponentElementRender = RenderElement<
    FSComponentViewState,
    FSComponentElementRefs,
    FSComponentElement
>;
export type FSComponentElementPreRender = [FSComponentElementRefs, FSComponentElementRender];

export declare function render(options?: RenderElementOptions): FSComponentElementPreRender;
