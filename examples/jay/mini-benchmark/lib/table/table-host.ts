import benchmark from '../benchmark';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { render as TableHostRender, TableHostElementRefs } from './table-host.jay-html';

interface TableHostProps {
    cycles: number;
}

function TableHostConstructor({ cycles }: Props<TableHostProps>, refs: TableHostElementRefs) {
    let [size, setSize] = createSignal(100);
    let [updates, setUpdates] = createSignal(100);
    let [stateManagement, setStateManagement] = createSignal('immutable');

    refs.size.oninput(({ event }) => {
        const size = (event.target as HTMLInputElement).value;
        setSize(Number(size));
    });

    refs.updates.oninput(({ event }) => {
        const updates = (event.target as HTMLInputElement).value;
        setUpdates(Number(updates));
    });

    refs.stateManagement.oninput(({ event }) => {
        const newStateManagement = (event.target as HTMLSelectElement).value;
        setStateManagement(newStateManagement);
    });

    const run = (progressCallback: (string) => void) => {
        benchmark((index) => refs.table.updateData(index), cycles(), progressCallback);
    };
    return {
        render: () => ({ size, updates, stateManagement }),
        run,
    };
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);
