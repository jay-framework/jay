import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, RenderElementOptions} from "jay-runtime";

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

export function render(viewState: TableViewState, options?: RenderElementOptions): TableElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('table', {}, [
        de('tbody', {}, [
          forEach(vs => vs.line, (vs1: Line) => {
            return de('tr', {}, [
              forEach(vs => vs.cell, (vs2: Cell) => {
                return e('td', {}, [dt(vs => vs.value)                ])}, 'id')
            ])}, 'id')
        ])
      ])
    ]), options);
}