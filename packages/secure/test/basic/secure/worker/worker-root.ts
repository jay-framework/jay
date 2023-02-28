import {Basic} from "./basic";
import {workerRoot} from "../../../../lib/worker-root";

export function initializeWorker() {
    workerRoot([{
        refName: 'comp1',
        compCreator: Basic,
        getProps: vs => ({safe: '', firstName: vs.firstName, lastName: vs.lastName})}])
}