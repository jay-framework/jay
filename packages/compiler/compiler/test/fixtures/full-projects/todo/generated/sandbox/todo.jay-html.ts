import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
} from 'jay-runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxElement as e,
    sandboxChildComp as childComp,
    sandboxForEach as forEach,
} from 'jay-secure';
// @ts-expect-error Cannot find module
import { Item } from './item?jay-workerSandbox';

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
// @ts-ignore error due to cannot find item jay html module above
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
            refNewTodo,
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
        elementBridge(viewState, refManager, () => [
            e(refNewTodo()),
            e(refToggleAll()),
            forEach(
                (vs) => vs.shownTodos,
                'id',
                () => [
                    childComp(
                        Item,
                        (vs1: ShownTodo) => ({ title: vs1.title, isCompleted: vs1.isCompleted }),
                        refItems(),
                    ),
                ],
            ),
            e(refFilterAll()),
            e(refFilterActive()),
            e(refFilterCompleted()),
            e(refClearCompleted()),
        ]) as TodoElement;
    return [refManager.getPublicAPI() as TodoElementRefs, render];
}
