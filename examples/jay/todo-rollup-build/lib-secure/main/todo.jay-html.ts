import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    dynamicProperty as dp,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from '@jay-framework/runtime';
import { secureChildComp as childComp } from '@jay-framework/secure';
import { Item } from './item';

export enum Filter {
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
    filter: Filter;
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

export function render(options?: RenderElementOptions): TodoElementPreRender {
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
    ] = ReferencesManager.for(
        options,
        ['newTodo', 'toggleAll', 'filterAll', 'filterActive', 'filterCompleted', 'clearCompleted'],
        [],
        [],
        ['items'],
    );
    const render = (viewState: TodoViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [
                e('section', { class: 'todoapp' }, [
                    de('div', {}, [
                        e('header', { class: 'header' }, [
                            e('h1', { class: 'main-title' }, ['todos']),
                            e(
                                'input',
                                {
                                    class: 'new-todo',
                                    placeholder: 'What needs to be done?',
                                    value: dp((vs) => vs.newTodo),
                                    autofocus: '',
                                },
                                [],
                                refNwTodo(),
                            ),
                        ]),
                        c(
                            (vs: TodoViewState) => vs.hasItems,
                            () =>
                                e('section', { class: 'main' }, [
                                    e(
                                        'input',
                                        {
                                            id: 'toggle-all',
                                            class: 'toggle-all',
                                            type: 'checkbox',
                                            checked: dp((vs) => vs.noActiveItems),
                                        },
                                        [],
                                        refToggleAll(),
                                    ),
                                    e('label', { for: 'toggle-all' }, []),
                                    de('ul', { class: 'todo-list' }, [
                                        forEach(
                                            (vs) => vs.shownTodos,
                                            (vs1: ShownTodoOfTodoViewState) => {
                                                return childComp(
                                                    Item,
                                                    (vs: ShownTodoOfTodoViewState) => ({
                                                        title: vs.title,
                                                        isCompleted: vs.isCompleted,
                                                    }),
                                                    refItems(),
                                                );
                                            },
                                            'id',
                                        ),
                                    ]),
                                ]),
                        ),
                        c(
                            (vs) => vs.hasItems,
                            () =>
                                de('footer', { class: 'footer' }, [
                                    e('span', { class: 'todo-count' }, [
                                        e('strong', {}, [dt((vs) => vs.activeTodoCount)]),
                                        e('span', {}, [' ']),
                                        e('span', {}, [dt((vs) => vs.activeTodoWord)]),
                                        e('span', {}, [' left']),
                                    ]),
                                    e('ul', { class: 'filters' }, [
                                        e('li', {}, [
                                            e(
                                                'a',
                                                {
                                                    class: da(
                                                        (vs) =>
                                                            `${
                                                                vs.filter === Filter.all
                                                                    ? 'selected'
                                                                    : ''
                                                            }`,
                                                    ),
                                                },
                                                ['All'],
                                                refFilterAll(),
                                            ),
                                        ]),
                                        e('span', {}, [' ']),
                                        e('li', {}, [
                                            e(
                                                'a',
                                                {
                                                    class: da(
                                                        (vs) =>
                                                            `${
                                                                vs.filter === Filter.active
                                                                    ? 'selected'
                                                                    : ''
                                                            }`,
                                                    ),
                                                },
                                                ['Active'],
                                                refFilterActive(),
                                            ),
                                        ]),
                                        e('span', {}, [' ']),
                                        e('li', {}, [
                                            e(
                                                'a',
                                                {
                                                    class: da(
                                                        (vs) =>
                                                            `${
                                                                vs.filter === Filter.completed
                                                                    ? 'selected'
                                                                    : ''
                                                            }`,
                                                    ),
                                                },
                                                ['Completed'],
                                                refFilterCompleted(),
                                            ),
                                        ]),
                                    ]),
                                    c(
                                        (vs) => vs.showClearCompleted,
                                        () =>
                                            e(
                                                'button',
                                                { class: 'clear-completed' },
                                                [' Clear completed '],
                                                refClearCompleted(),
                                            ),
                                    ),
                                ]),
                        ),
                    ]),
                ]),
                e('footer', { class: 'info' }, [
                    e('p', {}, ['Double-click to edit a todo']),
                    e('p', {}, [
                        'Created by ',
                        e('a', { href: 'http://github.com/petehunt/' }, ['petehunt']),
                    ]),
                    e('p', {}, ['Part of ', e('a', { href: 'http://todomvc.com' }, ['TodoMVC'])]),
                ]),
            ]);
        }) as TodoElement;
    return [refManager.getPublicAPI() as TodoElementRefs, render];
}
