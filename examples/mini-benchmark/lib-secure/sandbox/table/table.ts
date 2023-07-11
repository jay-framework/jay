import {Line, render, TableElementRefs} from './table.jay.html';
import {createEffect, createMutableState, makeJayComponent, Props} from 'jay-component';

interface TableProps {
    tableSize: number
    numCellsToUpdate: number
}

function initTable(tableSize: number): Line[] {
    let tableLines = []
    for (let x = 0; x < tableSize; x++) {
        tableLines[x] = {id: x, cell: []};
        for (let y = 0; y < tableSize; y++) {
            tableLines[x].cell[y] = {id: y, value: Math.round(Math.random()*100)};
        }
    }
    return tableLines;
}

function TableConstructor({tableSize, numCellsToUpdate}: Props<TableProps>, refs: TableElementRefs) {

    let line = createMutableState(initTable(tableSize()));

    createEffect(() => {
        let table = initTable(tableSize())
        if (line().length !== tableSize()) {
            table.forEach((item, index) => table[index] = item)
        }
    })

    const updateData = (cycle: number) => {
        for (let i = 0; i < numCellsToUpdate(); i++) {
            let x = Math.floor(Math.random()*tableSize());
            let y = Math.floor(Math.random()*tableSize());
            line()[x].cell[y].value = Math.round(Math.random()*100);
        }
    }

    return {
        render: () => ({line}),
        updateData
    }
}

export const Table = makeJayComponent(render, TableConstructor);