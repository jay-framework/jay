import {render} from './table.jay.html';
import {makeJayComponentBridge} from "jay-secure";

interface TableProps {
    tableSize: number
    numCellsToUpdate: number
}

export const Table = makeJayComponentBridge(render);