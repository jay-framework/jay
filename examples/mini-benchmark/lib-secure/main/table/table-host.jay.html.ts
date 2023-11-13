import {JayElement, element as e, dynamicAttribute as da, dynamicProperty as dp, ConstructContext, HTMLElementProxy, elemRef as er, RenderElementOptions} from "jay-runtime";
import {Table} from "./table";

export interface TableHostViewState {
  size: number,
  updates: number,
  stateManagement: string
}

export interface TableHostElementRefs {
  size: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  updates: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  stateManagement: HTMLElementProxy<TableHostViewState, HTMLSelectElement>,
  table: HTMLElementProxy<TableHostViewState, HTMLTableElement>
}

export type TableHostElement = JayElement<TableHostViewState, TableHostElementRefs>

export function render(viewState: TableHostViewState, options?: RenderElementOptions): TableHostElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [
        e('label', {for: 'size'}, ['Size of the table to generate: ']),
        e('input', {id: 'size', value: dp(vs => vs.size)}, [], er('size'))
      ]),
      e('div', {}, [
        e('label', {for: 'updates'}, ['Number of updates at each cycle: ']),
        e('input', {id: 'updates', value: dp(vs => vs.updates)}, [], er('updates'))
      ]),
      e('div', {}, [
        e('label', {for: 'state-management'}, ['Number of updates at each cycle: ']),
        e('select', {id: 'state-management'}, [
          e('option', {value: 'immutable'}, ['immutable']),
          e('option', {value: 'immer'}, ['immer']),
          e('option', {value: 'json-patch'}, ['json-patch'])
        ], er('stateManagement'))
      ]),
      e('table', {tablesize: da(vs => vs.size), numcellstoupdate: da(vs => vs.updates), statemanagement: da(vs => vs.stateManagement)}, [], er('table'))
    ]), options);
}