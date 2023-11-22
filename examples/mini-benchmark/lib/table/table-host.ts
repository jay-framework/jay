import benchmark from '../benchmark';
import { createState, makeJayComponent, Props } from 'jay-component';
import { render as TableHostRender, TableHostElementRefs } from './table-host.jay.html';

interface TableHostProps {
    cycles: number;
}

function TableHostConstructor({ cycles }: Props<TableHostProps>, refs: TableHostElementRefs) {
    let [size, setSize] = createState(100);
    let [updates, setUpdates] = createState(100);
    let [stateManagement, setStateManagement] = createState('immutable');

    refs.size
        .oninput$(({ event }) => (event.target as HTMLInputElement).value)
        .then(({ event: size }) => setSize(Number(size)));

    refs.updates
        .oninput$(({ event }) => (event.target as HTMLInputElement).value)
        .then(({ event: updates }) => setUpdates(Number(updates)));

    refs.stateManagement
        .oninput$(({ event }) => (event.target as HTMLSelectElement).value)
        .then(({ event: newStateManagement }) => setStateManagement(newStateManagement));

    const run = (progressCallback: (string) => void) => {
        // @ts-expect-error Property updateData does not exist on type
        benchmark((index) => refs.table.updateData(index), cycles(), progressCallback);
    };
    return {
        render: () => ({ size, updates, stateManagement }),
        run,
    };
}

export const TableHost = makeJayComponent(TableHostRender, TableHostConstructor);
