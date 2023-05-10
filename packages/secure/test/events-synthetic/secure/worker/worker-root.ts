import {Comp, CompProps} from "./comp";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";
import {sandboxChildComp} from "../../../../lib/sandbox/sandbox-element";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, CompProps>(Comp, vs => ({}), 'comp1')
    ])
}