import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
} from '@jay-framework/runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxElement as e,
    sandboxChildComp as childComp,
    sandboxForEach as forEach,
} from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { Item } from './item?jay-workerSandbox';

export enum FilterOfTodoViewState {
    all,
    active,
    completed,
}

export interface ShownTodoOfTodoViewState {
    id: string;
    title: string;
    isCompleted: boolean;
}

export interface TodoViewState {
    activeTodoCount: number;
    activeTodoWord: string;
    hasItems: boolean;
    noActiveItems: boolean;
    filter: FilterOfTodoViewState;
    showClearCompleted: boolean;
    newTodo: string;
    shownTodos: Array<ShownTodoOfTodoViewState>;
}

export type ItemRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Item>>;
// @ts-ignore error due to cannot find item jay html module above
export type ItemRefs<ParentVS> = ComponentCollectionProxy<ParentVS, ItemRef<ParentVS>> &
    OnlyEventEmitters<ItemRef<ParentVS>>;

export interface TodoElementRefs {
    newTodo: HTMLElementProxy<TodoViewState, HTMLInputElement>;
    toggleAll: HTMLElementProxy<TodoViewState, HTMLInputElement>;
    filterAll: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    filterActive: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    filterCompleted: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
    clearCompleted: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
    shownTodos: {
        items: ItemRefs<ShownTodoOfTodoViewState>;
    };
}

export type TodoSlowViewState = {};
export type TodoFastViewState = {};
export type TodoInteractiveViewState = TodoViewState;

export type TodoElement = JayElement<TodoViewState, TodoElementRefs>;
export type TodoElementRender = RenderElement<TodoViewState, TodoElementRefs, TodoElement>;
export type TodoElementPreRender = [TodoElementRefs, TodoElementRender];
export type TodoContract = JayContract<
    TodoViewState,
    TodoElementRefs,
    TodoSlowViewState,
    TodoFastViewState,
    TodoInteractiveViewState
>;

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
        elementBridge(viewState, refManager, () => [
            e(refNewTodo()),
            e(refToggleAll()),
            forEach(
                (vs: TodoViewState) => vs.shownTodos,
                'id',
                () => [
                    childComp(
                        Item,
                        (vs1: ShownTodoOfTodoViewState) => ({
                            title: vs1.title,
                            isCompleted: vs1.isCompleted,
                        }),
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
