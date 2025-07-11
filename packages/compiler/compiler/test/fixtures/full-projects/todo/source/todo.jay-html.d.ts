import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
} from '@jay-framework/runtime';
import { Item } from './item';

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

export type TodoElement = JayElement<TodoViewState, TodoElementRefs>;
export type TodoElementRender = RenderElement<TodoViewState, TodoElementRefs, TodoElement>;
export type TodoElementPreRender = [TodoElementRefs, TodoElementRender];
export type TodoContract = JayContract<TodoViewState, TodoElementRefs>;

export declare function render(options?: RenderElementOptions): TodoElementPreRender;
