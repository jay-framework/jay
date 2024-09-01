import {
    JayElement,
    element as e,
    dynamicProperty as dp,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions, ReferencesManager, RenderElement,
} from 'jay-runtime';
import { Table as TableComp } from './table';
import { TableComponentType } from './table-refs';
import { secureChildComp as childComp } from 'jay-secure';

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

export function render(
    options?: RenderElementOptions,
): TableHostElementPreRender {
    const [refManager, [refSize, refUpdates, refStateManagement, refTable]] =
        ReferencesManager.for(options, ['size', 'updates', 'stateManagement'], [], ['table'], []);
    const render = (viewState: TableHostViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () =>
            e('div', {}, [
                e('div', {}, [
                    e('label', { for: 'size' }, ['Size of the table to generate: ']),
                    e('input', { id: 'size', value: dp((vs) => vs.size) }, [], refSize()),
                ]),
                e('div', {}, [
                    e('label', { for: 'updates' }, ['Number of updates at each cycle: ']),
                    e('input', { id: 'updates', value: dp((vs) => vs.updates) }, [], refUpdates()),
                ]),
                e('div', {}, [
                    e('label', { for: 'state-management' }, ['Number of updates at each cycle: ']),
                    e(
                        'select',
                        { id: 'state-management' },
                        [
                            e('option', { value: 'immutable' }, ['immutable']),
                            e('option', { value: 'immer' }, ['immer']),
                            e('option', { value: 'json-patch' }, ['json-patch']),
                        ],
                        refStateManagement(),
                    ),
                ]),
                childComp(
                    TableComp,
                    (vs: TableHostViewState) => ({
                        tableSize: vs.size,
                        numCellsToUpdate: vs.updates,
                        stateManagement: vs.stateManagement,
                    }),
                    refTable(),
                ),
            ]),
    ) as TableHostElement;
    return [refManager.getPublicAPI() as TableHostElementRefs, render]
}
