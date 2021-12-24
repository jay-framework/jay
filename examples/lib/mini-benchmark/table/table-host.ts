import benchmark from "../benchmark";
import {createEvent, createState, makeJayComponent, Props } from 'jay-component';
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
    let onRunClick = createEvent<void>();
    refs.run.onclick = () => {
        onRunClick.emit();
    }
    const updateData = (index) => refs.table.updateData(index);

    return {
        render: () => ({cycles, size, updates}),
        onRunClick,
        updateData
    }
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);

export default function run(target, cycles, progressCallback) {
    let host = TableHost({cycles, progressCallback});
    host.onRunClick = () => {
        benchmark(index => host.updateData(index), cycles, progressCallback);
    }
    target.innerHTML = '';
    target.appendChild(host.element.dom);

}