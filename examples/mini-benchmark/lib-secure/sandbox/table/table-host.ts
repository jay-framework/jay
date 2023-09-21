import benchmark from '../benchmark';
import { createState, makeJayComponent, Props } from 'jay-component';
import {
    render as TableHostRender,
    TableHostElementRefs,
    TableHostViewState,
} from './table-host.jay.html';
import { handler$ } from 'jay-secure/dist/$func';

interface TableHostProps {
    cycles: number;
}

function TableHostConstructor({ cycles }: Props<TableHostProps>, refs: TableHostElementRefs) {
    let [size, setSize] = createState(100);
    let [updates, setUpdates] = createState(100);
    let [stateManagement, setStateManagement] = createState('immutable');

    refs.size
        .oninput$(handler$<Event, TableHostViewState, any>('2'))
        .then(({ event: size }) => setSize(Number(size)));

    refs.updates
        .oninput$(handler$<Event, TableHostViewState, any>('2'))
        .then(({ event: updates }) => setUpdates(Number(updates)));

    refs.stateManagement
        .oninput$(handler$<Event, TableHostViewState, any>('2'))
        .then(({ event: newStateManagement }) => setStateManagement(newStateManagement));

    const run = (progressCallback: (string) => void) => {
        benchmark((index) => refs.table.updateData(index), cycles(), progressCallback);
    };
    return {
        render: () => ({ size, updates, stateManagement }),
        run,
    };
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);
