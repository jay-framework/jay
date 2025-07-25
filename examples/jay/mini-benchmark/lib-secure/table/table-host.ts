import benchmark from '../benchmark';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';
import {
    render as TableHostRender,
    TableHostElementRefs,
    TableHostViewState,
} from './table-host.jay-html';
import { JayEvent } from '@jay-framework/runtime';

interface TableHostProps {
    cycles: number;
}

function TableHostConstructor({ cycles }: Props<TableHostProps>, refs: TableHostElementRefs) {
    let [size, setSize] = createSignal(100);
    let [updates, setUpdates] = createSignal(100);
    let [stateManagement, setStateManagement] = createSignal('immutable');

    refs.size.oninput(({ event }: JayEvent<Event, TableHostViewState>) => {
        const size = (event.target as HTMLInputElement).value;
        setSize(Number(size));
    });

    refs.updates.oninput(({ event }: JayEvent<Event, TableHostViewState>) => {
        const updates = (event.target as HTMLInputElement).value;
        setUpdates(Number(updates));
    });

    refs.stateManagement.oninput(({ event }: JayEvent<Event, TableHostViewState>) => {
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
