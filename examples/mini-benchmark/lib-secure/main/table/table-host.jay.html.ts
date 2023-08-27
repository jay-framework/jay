import {JayElement, element as e, dynamicProperty as dp, ConstructContext, HTMLElementProxy, elemRef as er, compRef as cr, RenderElementOptions} from "jay-runtime";
import {Table as TableComp} from './table';
import {TableRef} from "./table-refs";
import {secureChildComp as childComp} from "jay-secure";

export interface TableHostViewState {
  size: number,
  updates: number,
  stateManagement: string
}

export interface TableHostElementRefs {
  size: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  updates: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  stateManagement: HTMLElementProxy<TableHostViewState, HTMLSelectElement>,
  table: TableRef<TableHostViewState>
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
          e('option', {value: 'immer'}, ['immer'])
        ], er('stateManagement'))
      ]),
      childComp(TableComp, (vs: TableHostViewState) => ({tableSize: vs.size, numCellsToUpdate: vs.updates, stateManagement: vs.stateManagement}), cr('table'))
    ]), options);
}