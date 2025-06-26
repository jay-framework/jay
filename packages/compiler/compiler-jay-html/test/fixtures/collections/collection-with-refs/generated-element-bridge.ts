import { JayElement, RenderElement, HTMLElementCollectionProxy, JayContract } from 'jay-runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxElement as e,
    sandboxForEach as forEach,
} from 'jay-secure';

export interface ItemOfCollectionWithRefsViewState {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface GroupItemOfGroupOfCollectionWithRefsViewState {
    itemId: string;
    item: string;
}

export interface GroupOfCollectionWithRefsViewState {
    groupId: string;
    groupItems: Array<GroupItemOfGroupOfCollectionWithRefsViewState>;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<ItemOfCollectionWithRefsViewState>;
    groups: Array<GroupOfCollectionWithRefsViewState>;
}

export interface CollectionWithRefsElementRefs {
    items: {
        name: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        completed: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        cost: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        done: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLButtonElement>;
    };
    groups: {
        groupItems: {
            item: HTMLElementCollectionProxy<
                GroupItemOfGroupOfCollectionWithRefsViewState,
                HTMLDivElement
            >;
        };
    };
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
export type CollectionWithRefsContract = JayContract<
    CollectionWithRefsViewState,
    CollectionWithRefsElementRefs
>;

export function render(): CollectionWithRefsElementPreRender {
    const [itemsRefManager, [refName, refCompleted, refCost, refDone]] =
        SecureReferencesManager.forElement([], ['name', 'completed', 'cost', 'done'], [], []);
    const [groupItemsRefManager, [refItem]] = SecureReferencesManager.forElement(
        [],
        ['item'],
        [],
        [],
    );
    const [groupsRefManager, []] = SecureReferencesManager.forElement([], [], [], [], {
        groupItems: groupItemsRefManager,
    });
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], [], {
        items: itemsRefManager,
        groups: groupsRefManager,
    });
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
                        (vs1: GroupOfCollectionWithRefsViewState) => vs1.groupItems,
                        'itemId',
                        () => [e(refItem())],
                    ),
                ],
            ),
        ]) as CollectionWithRefsElement;
    return [refManager.getPublicAPI() as CollectionWithRefsElementRefs, render];
}
