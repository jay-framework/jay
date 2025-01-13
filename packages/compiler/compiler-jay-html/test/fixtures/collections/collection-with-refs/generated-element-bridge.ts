import { JayElement, RenderElement, HTMLElementCollectionProxy } from 'jay-runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxElement as e,
    sandboxForEach as forEach,
} from 'jay-secure';

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface GroupItem {
    itemId: string;
    item: string;
}

export interface Group {
    groupId: string;
    groupItems: Array<GroupItem>;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<Item>;
    groups: Array<Group>;
}

export interface CollectionWithRefsElementRefs {
    name: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    done: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
}

export type CollectionWithRefsElement = JayElement<
    CollectionWithRefsViewState,
    CollectionWithRefsElementRefs
>;
export type CollectionWithRefsElementRender = RenderElement<
    CollectionWithRefsViewState,
    CollectionWithRefsElementRefs,
    CollectionWithRefsElement
>;
export type CollectionWithRefsElementPreRender = [
    CollectionWithRefsElementRefs,
    CollectionWithRefsElementRender,
];

export function render(): CollectionWithRefsElementPreRender {
    const [refManager, [refName, refCompleted, refCost, refDone]] =
        SecureReferencesManager.forElement([], ['name', 'completed', 'cost', 'done'], [], []);
    const render = (viewState: CollectionWithRefsViewState) =>
        elementBridge(viewState, refManager, () => [
            forEach(
                (vs: CollectionWithRefsViewState) => vs.items,
                'id',
                () => [e(refName()), e(refCompleted()), e(refCost()), e(refDone())],
            ),
            forEach(
                (vs: CollectionWithRefsViewState) => vs.groups,
                'groupId',
                () => [
                    forEach(
                        (vs1: Group) => vs1.groupItems,
                        'itemId',
                        () => [],
                    ),
                ],
            ),
        ]) as CollectionWithRefsElement;
    return [refManager.getPublicAPI() as CollectionWithRefsElementRefs, render];
}
