import {Parent, ParentProps} from "./parent";
import {sandboxRoot} from "../../../../lib";
import {sandboxChildComp} from "../../../../lib";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, ParentProps>(Parent, vs => ({}), 'comp1')
    ])
}