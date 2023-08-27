import {Parent, ParentProps} from "./parent";
import {compRef, sandboxRoot} from "../../../../lib";
import {sandboxChildComp} from "../../../../lib";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp(Parent, vs => ({}), compRef('comp1'))
    ])
}