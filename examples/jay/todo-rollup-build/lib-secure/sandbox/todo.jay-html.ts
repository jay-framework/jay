import {
    ComponentCollectionProxy,
    HTMLElementProxy,
    JayElement,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    RenderElement,
} from 'jay-runtime';
import { elementBridge, SecureReferencesManager } from 'jay-secure';
import {
    sandboxElement as e,
    sandboxCondition as c,
    sandboxForEach as forEach,
    sandboxChildComp as childComp,
} from 'jay-secure';
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

export type ItemRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Item>>;
export type ItemRefs<ParentVS> = ComponentCollectionProxy<ParentVS, ItemRef<ParentVS>> &
    OnlyEventEmitters<ItemRef<ParentVS>>;
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
export type TodoElementRender = RenderElement<TodoViewState, TodoElementRefs, TodoElement>;
export type TodoElementPreRender = [TodoElementRefs, TodoElementRender];

export function render(): TodoElementPreRender {
    const [
        refManager,
        [
            refNwTodo,
            refToggleAll,
            refFilterAll,
            refFilterActive,
            refFilterCompleted,
            refClearCompleted,
            refItems,
        ],
    ] = SecureReferencesManager.forElement(
        ['newTodo', 'toggleAll', 'filterAll', 'filterActive', 'filterCompleted', 'clearCompleted'],
        [],
        [],
        ['items'],
    );
    const render = (viewState: TodoViewState) =>
        elementBridge(viewState, refManager, () => {
            return [
                e(refNwTodo()),
                c(
                    (vs) => vs.hasItems,
                    [
                        e(refToggleAll()),
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
                        e(refFilterAll()),
                        e(refFilterActive()),
                        e(refFilterCompleted()),
                        e(refClearCompleted()),
                    ],
                ),
            ];
        }) as unknown as TodoElement;
    return [refManager.getPublicAPI() as TodoElementRefs, render];
}
