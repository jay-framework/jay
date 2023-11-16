import { JayElement, HTMLElementCollectionProxy } from 'jay-runtime';
import {
    elementBridge,
    sandboxElement as e,
    elemCollectionRef as ecr,
    sandboxForEach as forEach,
} from 'jay-secure';

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<Item>;
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

export function render(viewState: CollectionWithRefsViewState): CollectionWithRefsElement {
    return elementBridge(viewState, () => {
        const refName = ecr('name');
        const refCompleted = ecr('completed');
        const refCost = ecr('cost');
        const refDone = ecr('done');
        return [
            forEach(
                (vs) => vs.items,
                'id',
                () => [e(refName()), e(refCompleted()), e(refCost()), e(refDone())],
            ),
        ];
    });
}
