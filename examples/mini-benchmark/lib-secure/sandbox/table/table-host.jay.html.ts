import {HTMLElementProxy, JayElement,} from "jay-runtime";
import {Table as TableComp} from './table';
import {elementBridge, sandboxChildComp as childComp, sandboxElement as e} from "jay-secure";
import {TableRef} from "../../main/table/table-refs";

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

export function render(viewState: TableHostViewState): TableHostElement {
    return elementBridge(viewState, () => [
        e('size'),
        e('updates'),
        childComp(TableComp, vs => ({tableSize: vs.size, numCellsToUpdate: vs.updates}), 'table')
    ])
}