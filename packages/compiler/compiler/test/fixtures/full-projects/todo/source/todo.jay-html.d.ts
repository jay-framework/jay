import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
} from 'jay-runtime';
import { Item } from './item';

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

export declare function render(options?: RenderElementOptions): TodoElementPreRender;
