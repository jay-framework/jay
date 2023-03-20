import {Comp} from "./comp";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";

export function initializeWorker() {
    sandboxRoot([{
        refName: 'comp1',
        compCreator: Comp,
        getProps: vs => ({})}])
}