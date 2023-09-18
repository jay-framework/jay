import {JayElement} from "jay-runtime";
import {elementBridge, sandboxChildComp as childComp, compRef as cr, compCollectionRef as ccr, sandboxForEach as forEach} from "jay-secure";
import {CounterRef, CounterRefs} from "../counter/counter-refs";
import {Counter} from "../counter/counter";

export interface NestedCounter {
  counter: number,
  id: string
}

export interface DynamicComponentInComponentViewState {
  nestedCounters: Array<NestedCounter>,
  condition: boolean,
  count1: number
}

export interface DynamicComponentInComponentElementRefs {
  counter1: CounterRefs<NestedCounter>,
  counter2: CounterRef<DynamicComponentInComponentViewState>
}

export type DynamicComponentInComponentElement = JayElement<DynamicComponentInComponentViewState, DynamicComponentInComponentElementRefs>

export function render(viewState: DynamicComponentInComponentViewState): DynamicComponentInComponentElement {
  return elementBridge(viewState, () => {
    const refCounter1 = ccr('counter1');
    return [
      forEach(vs => vs.nestedCounters, 'id', () => [
        childComp(Counter, (vs: NestedCounter) => ({initialValue: vs.counter}), refCounter1())
      ]),
      childComp(Counter, (vs: DynamicComponentInComponentViewState) => ({initialValue: vs.count1}), cr('counter2'))
    ]})
}