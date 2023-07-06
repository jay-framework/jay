import {render, TableElementRefs} from './table.jay.html';
import {createState, makeJayComponent, Props } from 'jay-component';
import { mutableObject } from 'jay-mutable';
import {produce} from 'immer'

interface TableProps {
    tableSize: number
    numCellsToUpdate: number
}

function TableConstructor({tableSize, numCellsToUpdate}: Props<TableProps>, refs: TableElementRefs) {

    let [line, setLines] = createState(() => {
        let tableLines = []
        for (let x = 0; x < tableSize(); x++) {
            tableLines[x] = {id: x, cell: []};
            for (let y = 0; y < tableSize(); y++) {
                tableLines[x].cell[y] = {id: y, value: Math.round(Math.random()*100)};
            }
        }
        return tableLines
    });

    const updateData = (cycle: number) => {
        setLines(produce(line(), draft => {
            for (let i = 0; i < numCellsToUpdate(); i++) {
                let x = Math.floor(Math.random()*tableSize());
                let y = Math.floor(Math.random()*tableSize());
                draft[x].cell[y].value = Math.round(Math.random()*100);
            }
        }))
    }

    return {
        render: () => ({line}),
        updateData
    }
}

export const Table = makeJayComponent(render, TableConstructor);