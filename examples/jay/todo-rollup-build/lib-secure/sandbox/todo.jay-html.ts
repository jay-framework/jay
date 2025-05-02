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
import { ShownTodoOfTodoViewState } from 'jay-example-todo-components/lib/todo.jay-html';

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
    shownTodos: {
        items: ItemRefs<ShownTodoOfTodoViewState>;
    };
    filterAll: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    filterActive: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    filterCompleted: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    clearCompleted: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
}

export type TodoElement = JayElement<TodoViewState, TodoElementRefs>;
export type TodoElementRender = RenderElement<TodoViewState, TodoElementRefs, TodoElement>;
export type TodoElementPreRender = [TodoElementRefs, TodoElementRender];

export function render(): TodoElementPreRender {
    const [shownTodosRefManager, [refItems]] = SecureReferencesManager.forElement(
        [],
        [],
        [],
        ['items'],
    );
    const [
        refManager,
        [
            refNewTodo,
            refToggleAll,
            refFilterAll,
            refFilterActive,
            refFilterCompleted,
            refClearCompleted,
        ],
    ] = SecureReferencesManager.forElement(
        ['newTodo', 'toggleAll', 'filterAll', 'filterActive', 'filterCompleted', 'clearCompleted'],
        [],
        [],
        [],
        {
            shownTodos: shownTodosRefManager,
        },
    );
    const render = (viewState: TodoViewState) =>
        elementBridge(viewState, refManager, () => {
            return [
                e(refNewTodo()),
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
