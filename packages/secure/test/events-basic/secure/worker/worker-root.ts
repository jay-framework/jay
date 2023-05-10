import {Counter, CounterProps} from "./counter";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";
import {sandboxChildComp} from "../../../../lib/sandbox/sandbox-element";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, CounterProps>(Counter, vs => ({title: 'first counter', initialCount: 12}), 'a')
    ])
}