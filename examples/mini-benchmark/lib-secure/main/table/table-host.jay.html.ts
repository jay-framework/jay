import {JayElement, element as e, dynamicProperty as dp, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {Table as TableComp} from './table';
import {secureChildComp as childComp} from "jay-secure";
import {TableRef} from "./table-refs";

export interface TableHostViewState {
  size: number,
  updates: number
}

export interface TableHostElementRefs {
  size: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  updates: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  table: TableRef<TableHostViewState>
}

export type TableHostElement = JayElement<TableHostViewState, TableHostElementRefs>

export function render(viewState: TableHostViewState, options?: RenderElementOptions): TableHostElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [
        e('label', {for: 'size'}, ['Size of the table to generate: ']),
        e('input', {id: 'size', ref: 'size', value: dp(vs => vs.size)}, [])
      ]),
      e('div', {}, [
        e('label', {for: 'updates'}, ['Number of updates at each cycle: ']),
        e('input', {id: 'updates', ref: 'updates', value: dp(vs => vs.updates)}, [])
      ]),
      childComp(TableComp, vs => ({tableSize: vs.size, numCellsToUpdate: vs.updates}), 'table')
    ]), options);
}