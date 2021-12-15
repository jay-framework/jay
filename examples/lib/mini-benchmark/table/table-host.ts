import benchmark from "../benchmark";
import {createState, makeJayComponent, Props } from 'jay-component';
import {render as TableHostRender, TableHostRefs} from "./table-host.jay.html";

interface TableHostProps {
    cycles: number,
    progressCallback: (status: string) => void
}

function TableHostConstructor({cycles, progressCallback}: Props<TableHostProps>, refs: TableHostRefs) {

    let [size, setSize] = createState(100);
    let [updates, setUpdates] = createState(100);

    refs.size.oninput = () => setSize(Number((refs.size as HTMLInputElement).value));
    refs.updates.oninput = () => setUpdates(Number((refs.updates as HTMLInputElement).value));
    refs.run.onclick = () => {
        benchmark(index => refs.table.updateData(index), cycles(), progressCallback());
    }

    return {
        render: () => ({cycles, size, updates})
    }
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);

export default function run(target, cycles, progressCallback) {
    let table = TableHost({cycles, progressCallback});
    target.innerHTML = '';
    target.appendChild(table.element.dom);

}