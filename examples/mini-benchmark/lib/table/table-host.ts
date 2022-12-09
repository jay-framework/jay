import benchmark from "../benchmark";
import {createState, makeJayComponent, Props } from 'jay-component';
import {render as TableHostRender, TableHostRefs} from "./table-host.jay.html";

interface TableHostProps {
    cycles: number
}

function TableHostConstructor({cycles}: Props<TableHostProps>, refs: TableHostRefs) {

    let [size, setSize] = createState(100);
    let [updates, setUpdates] = createState(100);

    refs.size
        .$oninput(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: size}) => setSize(Number(size)));

    refs.updates
        .$oninput(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: updates}) => setUpdates(Number(updates)));

    const run = (progressCallback: (string) => void) => {
        benchmark(index => refs.table.updateData(index), cycles(), progressCallback);
    }
    return {
        render: () => ({size, updates}),
        run
    }
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);