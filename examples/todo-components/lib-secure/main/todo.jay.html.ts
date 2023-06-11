import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, dynamicProperty as dp, conditional as c, dynamicElement as de, forEach, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {secureChildComp as childComp} from "jay-secure";
import {ItemRefs} from './item-refs';
import {Item} from './item';

export enum Filter {
  all,
  active,
  completed
}

export interface ShownTodo {
  id: string,
  title: string,
  isCompleted: boolean
}

export interface TodoViewState {
  activeTodoCount: number,
  activeTodoWord: string,
  hasItems: boolean,
  noActiveItems: boolean,
  filter: Filter,
  showClearCompleted: boolean,
  newTodo: string,
  shownTodos: Array<ShownTodo>
}

export interface TodoElementRefs {
  newTodo: HTMLElementProxy<TodoViewState, HTMLInputElement>,
  toggleAll: HTMLElementProxy<TodoViewState, HTMLInputElement>,
  items: ItemRefs<ShownTodo>,
  filterAll: HTMLElementProxy<TodoViewState, HTMLAnchorElement>,
  filterActive: HTMLElementProxy<TodoViewState, HTMLAnchorElement>,
  filterCompleted: HTMLElementProxy<TodoViewState, HTMLAnchorElement>,
  clearCompleted: HTMLElementProxy<TodoViewState, HTMLButtonElement>
}

export type TodoElement = JayElement<TodoViewState, TodoElementRefs>

export function render(viewState: TodoViewState, options?: RenderElementOptions): TodoElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('section', {class: 'todoapp'}, [
        de('div', {}, [
          e('header', {class: 'header'}, [
            e('h1', {class: 'main-title'}, ['todos']),
            e('input', {class: 'new-todo', placeholder: 'What needs to be done?', value: dp(vs => vs.newTodo), ref: 'newTodo', autofocus: ''}, [])
          ]),
          c(vs => vs.hasItems,
            e('section', {class: 'main'}, [
              e('input', {id: 'toggle-all', class: 'toggle-all', type: 'checkbox', ref: 'toggleAll', checked: dp(vs => vs.noActiveItems)}, []),
              e('label', {for: 'toggle-all'}, []),
              de('ul', {class: 'todo-list'}, [
                forEach(vs => vs.shownTodos, (vs1: ShownTodo) => {
                  return childComp(Item, vs => ({title: vs.title, isCompleted: vs.isCompleted}), 'items')}, 'id')
              ])
            ])
          ),
          c(vs => vs.hasItems,
            de('footer', {class: 'footer'}, [
              e('span', {class: 'todo-count'}, [
                e('strong', {}, [dt(vs => vs.activeTodoCount)]),
                e('span', {}, [' ']),
                e('span', {}, [dt(vs => vs.activeTodoWord)]),
                e('span', {}, [' left'])
              ]),
              e('ul', {class: 'filters'}, [
                e('li', {}, [
                  e('a', {ref: 'filterAll', class: da(vs => `${vs.filter === Filter.all?'selected':''}`)}, ['All'])
                ]),
                e('span', {}, [' ']),
                e('li', {}, [
                  e('a', {ref: 'filterActive', class: da(vs => `${vs.filter === Filter.active?'selected':''}`)}, ['Active'])
                ]),
                e('span', {}, [' ']),
                e('li', {}, [
                  e('a', {ref: 'filterCompleted', class: da(vs => `${vs.filter === Filter.completed?'selected':''}`)}, ['Completed'])
                ])
              ]),
              c(vs => vs.showClearCompleted,
                e('button', {class: 'clear-completed', ref: 'clearCompleted'}, [' Clear completed '])
              )
            ])
          )
        ])
      ]),
      e('footer', {class: 'info'}, [
        e('p', {}, ['Double-click to edit a todo']),
        e('p', {}, [
          'Created by ',
          e('a', {href: 'http://github.com/petehunt/'}, ['petehunt'])
        ]),
        e('p', {}, [
          'Part of ',
          e('a', {href: 'http://todomvc.com'}, ['TodoMVC'])
        ])
      ])
    ]), options, ['items']);
}