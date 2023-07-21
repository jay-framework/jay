import {Line, render, TableElementRefs} from './table.jay.html';
import {createState, makeJayComponent, Props } from 'jay-component';
import { mutableObject } from 'jay-mutable';
import {produce} from 'immer'

interface TableProps {
    tableSize: number
    numCellsToUpdate: number
    stateManagement: "mutable" | "immutable" | "immer"
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

function TableConstructor({tableSize, numCellsToUpdate, stateManagement}: Props<TableProps>, refs: TableElementRefs) {

    let [line, setLine] = createState(() => {
        if (stateManagement() === "mutable")
            return mutableObject(initTable(tableSize()))
        else
            return initTable(tableSize())
    });

    const updateData = (cycle: number) => {
        if (stateManagement() === "mutable") {
            for (let i = 0; i < numCellsToUpdate(); i++) {
                let x = Math.floor(Math.random() * tableSize());
                let y = Math.floor(Math.random() * tableSize());
                line()[x].cell[y].value = Math.round(Math.random() * 100);
            }
        }
        else if (stateManagement() === "immutable") {
            let copy = [...line()]
            for (let i = 0; i < numCellsToUpdate(); i++) {
                let x = Math.floor(Math.random()*tableSize());
                let y = Math.floor(Math.random()*tableSize());
                copy[x] = {...copy[x]}
                let cellCopy = [...(copy[x].cell)];
                cellCopy[y] = {...cellCopy[y], value: Math.round(Math.random()*100)};
                copy[x].cell = cellCopy;
            }
            setLine(copy);
        }
        else {
            setLine(produce(line(), draft => {
                for (let i = 0; i < numCellsToUpdate(); i++) {
                    let x = Math.floor(Math.random()*tableSize());
                    let y = Math.floor(Math.random()*tableSize());
                    draft[x].cell[y].value = Math.round(Math.random()*100);
                }
            }))
        }
    }

    return {
        render: () => ({line}),
        updateData
    }
}

export const Table = makeJayComponent(render, TableConstructor);