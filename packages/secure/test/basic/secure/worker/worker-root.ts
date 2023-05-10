import {Basic, BasicProps} from "./basic";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";
import {sandboxChildComp} from "../../../../lib/sandbox/sandbox-element";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, BasicProps>(Basic, vs => ({safe: '', firstName: vs.firstName, lastName: vs.lastName}), 'comp1')
    ])
}