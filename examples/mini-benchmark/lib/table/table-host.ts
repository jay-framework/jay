import benchmark from "../benchmark";
import {createState, makeJayComponent, Props } from 'jay-component';
import {render as TableHostRender, TableHostRefs} from "./table-host.jay.html";

interface TableHostProps {
    cycles: number
}

function TableHostConstructor({cycles}: Props<TableHostProps>, refs: TableHostRefs) {

    let [size, setSize] = createState(100);
    let [updates, setUpdates] = createState(100);

    refs.size.oninput = () => setSize(Number((refs.size as HTMLInputElement).value));
    refs.updates.oninput = () => setUpdates(Number((refs.updates as HTMLInputElement).value));

    const run = (progressCallback: (string) => void) => {
        benchmark(index => refs.table.updateData(index), cycles(), progressCallback);
    }
    return {
        render: () => ({size, updates}),
        run
    }
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);