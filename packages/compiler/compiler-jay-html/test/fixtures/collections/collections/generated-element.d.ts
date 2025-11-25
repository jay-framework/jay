import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ThingOfCollectionsViewState {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    title: string;
    things: Array<ThingOfCollectionsViewState>;
}

export interface CollectionsElementRefs {}

export type CollectionsSlowViewState = {};
export type CollectionsFastViewState = {};
export type CollectionsInteractiveViewState = CollectionsViewState;

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>;
export type CollectionsElementRender = RenderElement<
    CollectionsViewState,
    CollectionsElementRefs,
    CollectionsElement
>;
export type CollectionsElementPreRender = [CollectionsElementRefs, CollectionsElementRender];
export type CollectionsContract = JayContract<
    CollectionsViewState,
    CollectionsElementRefs,
    CollectionsSlowViewState,
    CollectionsFastViewState,
    CollectionsInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): CollectionsElementPreRender;
