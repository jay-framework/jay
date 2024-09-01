import {JayElement, RenderElement, RenderElementOptions} from 'jay-runtime';

export interface Thing {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    title: string;
    things: Array<Thing>;
}

export interface CollectionsElementRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>;
export type CollectionsElementRender = RenderElement<
    CollectionsViewState,
    CollectionsElementRefs,
    CollectionsElement
>;
export type CollectionsElementPreRender = [refs: CollectionsElementRefs, CollectionsElementRender];

export declare function render(options?: RenderElementOptions): CollectionsElementPreRender
