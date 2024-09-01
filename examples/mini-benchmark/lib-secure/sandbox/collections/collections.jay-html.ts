import {JayElement, RenderElement} from 'jay-runtime';
import {elementBridge, SecureReferencesManager} from 'jay-secure';

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    items: Array<Item>;
    title: string;
    numberOfItems: number;
}

export interface CollectionsElementRefs {}

export type CollectionsElement = JayElement<CollectionsViewState, CollectionsElementRefs>;
export type CollectionsElementRender = RenderElement<CollectionsViewState, CollectionsElementRefs, CollectionsElement>
export type CollectionsElementPreRender = [refs: CollectionsElementRefs, CollectionsElementRender]

export function render(): CollectionsElementPreRender {
    const [refManager, []] =
        SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: CollectionsViewState) => elementBridge(viewState, refManager, () => []);
    return [refManager.getPublicAPI() as CollectionsElementRefs, render]
}
