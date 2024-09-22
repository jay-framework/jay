import { render as TableHostRender } from './table-host.jay-html';
import { FunctionsRepository, makeJayComponentBridge } from 'jay-secure';

interface TableHostProps {
    cycles: number;
}

export const funcRepository: FunctionsRepository = {
    '2': ({ event }) => (event.target as HTMLInputElement).value,
};

export const TableHost = makeJayComponentBridge(TableHostRender, { funcRepository });
