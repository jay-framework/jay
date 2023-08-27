import {HTMLElementProxy, JayElement,} from "jay-runtime";
import {Table as TableComp} from './table';
import {compRef, elementBridge, elemRef, sandboxChildComp as childComp, sandboxElement as e} from "jay-secure";
import {TableRef} from "../../main/table/table-refs";

export interface TableHostViewState {
  size: number,
  updates: number
  stateManagement: string
}

export interface TableHostElementRefs {
  size: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  updates: HTMLElementProxy<TableHostViewState, HTMLInputElement>,
  stateManagement: HTMLElementProxy<TableHostViewState, HTMLSelectElement>,
  table: TableRef<TableHostViewState>
}

export type TableHostElement = JayElement<TableHostViewState, TableHostElementRefs>

export function render(viewState: TableHostViewState): TableHostElement {
    return elementBridge(viewState, () => [
        e(elemRef('size')),
        e(elemRef('updates')),
        e(elemRef('stateManagement')),
        childComp(TableComp, vs => ({tableSize: vs.size, numCellsToUpdate: vs.updates, stateManagement: vs.stateManagement}), compRef('table'))
    ])
}