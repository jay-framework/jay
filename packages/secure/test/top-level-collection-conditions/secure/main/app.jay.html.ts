import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions,
    dynamicElement as de, conditional as c, forEach, compRef as cr, compCollectionRef as ccr
} from "jay-runtime";
import {Counter} from './counter';
import {mainRoot as mr} from "../../../../lib/";
import {secureChildComp} from "../../../../lib/";
import {CounterRef, CounterRefs} from "./counter-refs";

export interface Counter {
    id: string,
    initialCount: number
}

export interface AppViewState {
    cond: boolean,
    initialCount: number,
    counters: Array<Counter>
}

export interface AppElementRefs {
    comp1: CounterRef<AppViewState>,
    comp2: CounterRefs<Counter>
}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(viewState, () => {
        const refComp2 = ccr('comp2');
        return mr(viewState, () =>
            de('div', {}, [
                c(vs => vs.cond,
                    secureChildComp(Counter, (vs: AppViewState) => ({title: 'conditional counter', initialCount: vs.initialCount, id: 'cond'}), cr('comp1'))
                ),
                forEach(vs => vs.counters, (vs1: Counter) => {
                    return secureChildComp(Counter, (vs: Counter) => ({title: `collection counter ${vs.id}`, initialCount: vs.initialCount, id: vs.id}), refComp2())}, 'id')
            ])
        )}, options);
}