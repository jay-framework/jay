import { JayElement, RenderElement } from 'jay-runtime';
import { elementBridge, SecureReferencesManager } from 'jay-secure';

export interface Cell {
    id: number;
    value: number;
}

export interface Line {
    id: number;
    cell: Array<Cell>;
}

export interface TableViewState {
    line: Array<Line>;
}

export interface TableElementRefs {}

export type TableElement = JayElement<TableViewState, TableElementRefs>;
export type TableElementRender = RenderElement<TableViewState, TableElementRefs, TableElement>;
export type TableElementPreRender = [refs: TableElementRefs, TableElementRender];

export function render(): TableElementPreRender {
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: TableViewState) => elementBridge(viewState, refManager, () => []);
    return [refManager.getPublicAPI() as TableElementRefs, render];
}
