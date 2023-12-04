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
    elemRef as er,
    compCollectionRef as ccr,
    RenderElementOptions,
} from 'jay-runtime';
import { secureChildComp as childComp } from 'jay-secure';
import { ItemRefs } from '../../lib/item-refs';
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

export function render(viewState: TodoViewState, options?: RenderElementOptions): TodoElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const refItems = ccr('items');
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
                                er('newTodo'),
                            ),
                        ]),
                        c(
                            (vs) => vs.hasItems,
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
                                    er('toggleAll'),
                                ),
                                e('label', { for: 'toggle-all' }, []),
                                de('ul', { class: 'todo-list' }, [
                                    forEach(
                                        (vs) => vs.shownTodos,
                                        (vs1: ShownTodo) => {
                                            return childComp(
                                                Item,
                                                (vs: ShownTodo) => ({
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
                                            er('filterAll'),
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
                                            er('filterActive'),
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
                                            er('filterCompleted'),
                                        ),
                                    ]),
                                ]),
                                c(
                                    (vs) => vs.showClearCompleted,
                                    e(
                                        'button',
                                        { class: 'clear-completed' },
                                        [' Clear completed '],
                                        er('clearCompleted'),
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
        },
        options,
    );
}
