import {render, TableRefs} from './table.jay.html';
import {createState, makeJayComponent, Props } from 'jay-component';
import { mutableObject } from 'jay-reactive';

interface TableProps {
    size: number
}

function TableConstructor({size}: Props<TableProps>, refs: TableRefs) {

    let [line, _] = createState(() => {
        let tableLines = []
        for (let x = 0; x < size(); x++) {
            tableLines[x] = {id: x, cell: []};
            for (let y = 0; y < size(); y++) {
                tableLines[x].cell[y] = {id: y, value: Math.round(Math.random()*100)};

            }
        }
        return mutableObject(tableLines)
    });

    const updateData = (cycle: number) => {
        let numCellsToUpdate = Math.round(Math.random()*100);
        for (let i = 0; i < numCellsToUpdate; i++) {
            let x = Math.floor(Math.random()*size());
            let y = Math.floor(Math.random()*size());
            line()[x].cell[y].value = Math.round(Math.random()*100);
        }
    }

    return {
        render: () => ({line}),
        updateData
    }
}

export const Table = makeJayComponent(render, TableConstructor);