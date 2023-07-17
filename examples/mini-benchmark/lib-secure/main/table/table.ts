import {render} from './table.jay.html';
import {makeJayComponentBridge} from "jay-secure";

interface TableProps {
    tableSize: number
    numCellsToUpdate: number,
    stateManagement: "mutable" | "immutable" | "immer"
}

export const Table = makeJayComponentBridge(render);