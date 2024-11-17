import { Line, render, TableElementRefs } from './table.jay-html';
import { createSignal, makeJayComponent, Props } from 'jay-component';
import { produce } from 'immer';
import { JSONPatch, patch, REPLACE } from 'jay-json-patch';

interface TableProps {
    tableSize: number;
    numCellsToUpdate: number;
    stateManagement: 'immutable' | 'immer';
}

function initTable(tableSize: number): Line[] {
    let tableLines = [];
    for (let x = 0; x < tableSize; x++) {
        tableLines[x] = { id: x, cell: [] };
        for (let y = 0; y < tableSize; y++) {
            tableLines[x].cell[y] = { id: y, value: Math.round(Math.random() * 100) };
        }
    }
    return tableLines;
}

function TableConstructor(
    { tableSize, numCellsToUpdate, stateManagement }: Props<TableProps>,
    refs: TableElementRefs,
) {
    let [line, setLine] = createSignal(() => initTable(tableSize()));

    const updateData = (cycle: number) => {
        if (stateManagement() === 'immutable') {
            let copy = [...line()];
            for (let i = 0; i < numCellsToUpdate(); i++) {
                let x = Math.floor(Math.random() * tableSize());
                let y = Math.floor(Math.random() * tableSize());
                copy[x] = { ...copy[x] };
                let cellCopy = [...copy[x].cell];
                cellCopy[y] = { ...cellCopy[y], value: Math.round(Math.random() * 100) };
                copy[x].cell = cellCopy;
            }
            setLine(copy);
        } else if (stateManagement() === 'immer') {
            setLine(
                produce(line(), (draft) => {
                    for (let i = 0; i < numCellsToUpdate(); i++) {
                        let x = Math.floor(Math.random() * tableSize());
                        let y = Math.floor(Math.random() * tableSize());
                        draft[x].cell[y].value = Math.round(Math.random() * 100);
                    }
                }),
            );
        } else {
            let jsonPatch: JSONPatch = [];
            for (let i = 0; i < numCellsToUpdate(); i++) {
                let x = Math.floor(Math.random() * tableSize());
                let y = Math.floor(Math.random() * tableSize());
                jsonPatch.push({
                    op: REPLACE,
                    path: [x, 'cell', y, 'value'],
                    value: Math.round(Math.random() * 100),
                });
            }
            setLine(patch(line(), jsonPatch));
        }
    };

    return {
        render: () => ({ line }),
        updateData,
    };
}

export const Table = makeJayComponent(render, TableConstructor);
