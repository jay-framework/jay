import {Counter} from "./counter";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";
import {sandboxChildComp, sandboxCondition, sandboxForEach} from "../../../../lib/sandbox/sandbox-element";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxCondition(vs => vs.cond, [
            sandboxChildComp<any, any>(Counter, vs => ({title: 'conditional counter', initialCount: vs.initialCount, id: 'cond'}), 'comp1')
        ]),
        sandboxForEach<any, any>(vs => vs.counters, "id", () => [
            sandboxChildComp<any, any>(Counter, vs => ({title: `collection counter ${vs.id}`, initialCount: vs.initialCount, id: vs.id}), 'comp2')
        ])
    ])
}