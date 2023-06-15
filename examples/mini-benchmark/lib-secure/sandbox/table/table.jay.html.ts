import {JayElement} from "jay-runtime";
import {elementBridge} from "jay-secure";

export interface Cell {
  id: number,
  value: number
}

export interface Line {
  id: number,
  cell: Array<Cell>
}

export interface TableViewState {
  line: Array<Line>
}

export interface TableElementRefs {}

export type TableElement = JayElement<TableViewState, TableElementRefs>

export function render(viewState: TableViewState): TableElement {
  return elementBridge(viewState, () => [])
}