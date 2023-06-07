import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, dynamicProperty as dp, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface ItemViewState {
  title: string,
  isEditing: boolean,
  editText: string,
  isCompleted: boolean
}

export interface ItemElementRefs {
  completed: HTMLElementProxy<ItemViewState, HTMLInputElement>,
  label: HTMLElementProxy<ItemViewState, HTMLLabelElement>,
  button: HTMLElementProxy<ItemViewState, HTMLButtonElement>,
  title: HTMLElementProxy<ItemViewState, HTMLInputElement>
}

export type ItemElement = JayElement<ItemViewState, ItemElementRefs>

export function render(viewState: ItemViewState, options?: RenderElementOptions): ItemElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('li', {class: da(vs => `${vs.isCompleted?'completed':''} ${vs.isEditing?'editing':''}`)}, [
      e('div', {class: 'view'}, [
        e('input', {class: 'toggle', type: 'checkbox', checked: dp(vs => vs.isCompleted), ref: 'completed'}, []),
        e('label', {ref: 'label'}, [dt(vs => vs.title)]),
        e('button', {ref: 'button', class: 'destroy'}, [])
      ]),
      e('input', {class: 'edit', value: dp(vs => vs.editText), ref: 'title'}, [])
    ]), options);
}