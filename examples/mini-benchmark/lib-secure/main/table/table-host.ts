import { render as TableHostRender } from './table-host.jay-html';
import { makeJayComponentBridge } from 'jay-secure';

interface TableHostProps {
    cycles: number;
}

export const TableHost = makeJayComponentBridge(TableHostRender);
