import {render, TableRefs} from './table.jay.html';
import benchmark from "../benchmark";
import {createState, makeJayComponent, Props } from 'jay-component';
import { mutableObject } from 'jay-reactive';
// import {render as TableHostRender, TableHostRefs} from "./table-host.jay.html";

interface TableProps {
    size: number
}

function TableConstructor({size}: Props<TableProps>, refs: TableRefs) {

    let tableLines = []
    for (let x = 0; x < size(); x++) {
        tableLines[x] = {id: x, cell: []};
        for (let y = 0; y < size(); y++) {
            tableLines[x].cell[y] = {id: y, value: Math.round(Math.random()*100)};

        }
    }

    let [line, setline] = createState(mutableObject(tableLines));

    const update = (cycle: number) => {
        let numCellsToUpdate = Math.round(Math.random()*100);
        for (let i = 0; i < numCellsToUpdate; i++) {
            let x = Math.floor(Math.random()*size());
            let y = Math.floor(Math.random()*size());
            line()[x].cell[y].value = Math.round(Math.random()*100);
        }
    }

    return {
        render: () => ({line}),
        update
    }
}

export const Table = makeJayComponent(render, TableConstructor);

// interface TableHostProps {
//     progressCallback: (string) => void
// }
//
// function TableHostConstructor({progressCallback}: Props<TableHostProps>, refs: TableHostRefs) {
//
//     let [cycles, setCycles] = createState(1000);
//     let [size, setSize] = createState(100);
//     let [updates, setUpdates] = createState(100);
//
//     refs.size.oninput = () => setSize(Number((refs.size as HTMLInputElement).value));
//     refs.cycles.oninput = () => setCycles(Number((refs.cycles as HTMLInputElement).value));
//     refs.updates.oninput = () => setUpdates(Number((refs.updates as HTMLInputElement).value));
//
//     let [lines, setLines] = createState([]);
//
//     refs.run.onclick = () => {
//         let tableLines = []
//         for (let x = 0; x < size(); x++) {
//             tableLines[x] = {id: x, cell: []};
//             for (let y = 0; y < size(); y++) {
//                 tableLines[x].cell[y] = {id: y, value: Math.round(Math.random()*100)};
//
//             }
//         }
//
//         setLines(mutableObject(tableLines));
//
//         benchmark(index => update(index), cycles(), progressCallback());
//     }
//
//
//     const update = (cycle: number) => {
//         let numCellsToUpdate = Math.round(Math.random()*100);
//         for (let i = 0; i < numCellsToUpdate; i++) {
//             let x = Math.floor(Math.random()*size());
//             let y = Math.floor(Math.random()*size());
//             lines()[x].cell[y].value = Math.round(Math.random()*100);
//         }
//     }
//
//     return {
//         render: () => ({cycles, size, updates, lines})
//     }
// }
//
// export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);
//
export default function run(target, cycles, progressCallback) {
    let table = Table({size: 100});
    target.innerHTML = '';
    target.appendChild(table.element.dom);

    benchmark(index => table.update(index), cycles, progressCallback);
}