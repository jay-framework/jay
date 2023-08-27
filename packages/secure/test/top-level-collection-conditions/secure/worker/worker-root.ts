import {Counter} from "./counter";
import {compCollectionRef, sandboxRoot} from "../../../../lib/";
import {sandboxChildComp, sandboxCondition, sandboxForEach} from "../../../../lib/";
import {compRef} from "../../../../lib";

export function initializeWorker() {
    sandboxRoot(() => {
        const refComp2 = compCollectionRef('comp2')
        return [
            sandboxCondition(vs => vs.cond, [
                sandboxChildComp(Counter, vs => ({title: 'conditional counter', initialCount: vs.initialCount, id: 'cond'}), compRef('comp1'))
            ]),
            sandboxForEach<any, any>(vs => vs.counters, "id", () => [
                sandboxChildComp(Counter, (vs: any) => ({title: `collection counter ${vs.id}`, initialCount: vs.initialCount, id: vs.id}), refComp2())
            ])
        ]
    })
}