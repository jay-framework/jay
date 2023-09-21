import { HTMLElementProxy, JayElement } from 'jay-runtime';
import { compCollectionRef, elementBridge, elemRef } from 'jay-secure';
import {
    sandboxElement as e,
    sandboxCondition as c,
    sandboxForEach as forEach,
    sandboxChildComp as childComp,
} from 'jay-secure';
import { ItemRefs } from '../main/item-refs';
import { Item, ItemProps } from './item';

export enum Filter {
    all,
    active,
    completed,
}

export interface ShownTodo {
    id: string;
    title: string;
    isCompleted: boolean;
}

export interface TodoViewState {
    activeTodoCount: number;
    activeTodoWord: string;
    hasItems: boolean;
    noActiveItems: boolean;
    filter: Filter;
    showClearCompleted: boolean;
    newTodo: string;
    shownTodos: Array<ShownTodo>;
}

export interface TodoElementRefs {
    newTodo: HTMLElementProxy<TodoViewState, HTMLInputElement>;
    toggleAll: HTMLElementProxy<TodoViewState, HTMLInputElement>;
    items: ItemRefs<ShownTodo>;
    filterAll: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    filterActive: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    filterCompleted: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    clearCompleted: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
}

export type TodoElement = JayElement<TodoViewState, TodoElementRefs>;

export function render(viewState: TodoViewState): TodoElement {
    return elementBridge(viewState, () => {
        const refItems = compCollectionRef('items');
        return [
            e(elemRef('newTodo')),
            c(
                (vs) => vs.hasItems,
                [
                    e(elemRef('toggleAll')),
                    forEach(
                        (vs) => vs.shownTodos,
                        'id',
                        () => [
                            childComp(
                                Item,
                                (vs: ShownTodo) => ({
                                    title: vs.title,
                                    isCompleted: vs.isCompleted,
                                }),
                                refItems(),
                            ),
                        ],
                    ),
                ],
            ),
            c(
                (vs) => vs.hasItems,
                [
                    e(elemRef('filterAll')),
                    e(elemRef('filterActive')),
                    e(elemRef('filterCompleted')),
                    e(elemRef('clearCompleted')),
                ],
            ),
        ];
    }) as unknown as TodoElement;
}
