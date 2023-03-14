import {Basic} from "./basic";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";

export function initializeWorker() {
    sandboxRoot([{
        refName: 'comp1',
        compCreator: Basic,
        getProps: vs => ({safe: '', firstName: vs.firstName, lastName: vs.lastName})}])
}