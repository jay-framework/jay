import {HTMLElementProxy, JayElement, ReferencesManager, RenderElement} from 'jay-runtime';
import { Table } from './table';
import {
    elementBridge,
    sandboxChildComp as childComp,
    sandboxElement as e, SecureReferencesManager,
} from 'jay-secure';
import { TableComponentType } from '../../main/table/table-refs';

export interface TableHostViewState {
    size: number;
    updates: number;
    stateManagement: string;
}

export interface TableHostElementRefs {
    size: HTMLElementProxy<TableHostViewState, HTMLInputElement>;
    updates: HTMLElementProxy<TableHostViewState, HTMLInputElement>;
    stateManagement: HTMLElementProxy<TableHostViewState, HTMLSelectElement>;
    table: TableComponentType<TableHostViewState>;
}

export type TableHostElement = JayElement<TableHostViewState, TableHostElementRefs>;
export type TableHostElementRender = RenderElement<TableHostViewState, TableHostElementRefs, TableHostElement>
export type TableHostElementPreRender = [refs: TableHostElementRefs, TableHostElementRender]

export function render(): TableHostElementPreRender {
    const [refManager, [refSize, refUpdates, refStateManagement, refTable]] =
        SecureReferencesManager.forElement(['size', 'updates', 'stateManagement'], [], ['table'], []);
    const render = (viewState: TableHostViewState) =>  elementBridge(viewState, refManager, () => [
        e(refSize()),
        e(refUpdates()),
        e(refStateManagement()),
        childComp(
            Table,
            (vs) => ({
                tableSize: vs.size,
                numCellsToUpdate: vs.updates,
                stateManagement: vs.stateManagement,
            }),
            refTable(),
        ),
    ]) as TableHostElement;
    return [refManager.getPublicAPI() as TableHostElementRefs, render]
}
