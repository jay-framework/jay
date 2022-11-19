import {JayElement, element as e, conditional as c, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {CounterRef, CounterRefs} from '../counter/counter-refs';
import {Counter} from '../counter/counter';

export interface NestedCounter {
  counter: number,
  id: string
}

export interface DynamicComponentInComponentViewState {
  nestedCounters: Array<NestedCounter>,
  condition: boolean,
  count1: number
}

export interface DynamicComponentInComponentRefs {
  counter1: CounterRefs<NestedCounter>,
  counter2: CounterRef<DynamicComponentInComponentViewState>
}

export type DynamicComponentInComponentElement = JayElement<DynamicComponentInComponentViewState, DynamicComponentInComponentRefs>

export function render(viewState: DynamicComponentInComponentViewState, options?: RenderElementOptions): DynamicComponentInComponentElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      forEach(vs => vs.nestedCounters, (vs1: NestedCounter) => {
        return childComp(Counter, vs => ({initialValue: vs.counter}), 'counter1')}, 'id'),
      c(vs => vs.condition,
        childComp(Counter, vs => ({initialValue: vs.count1}), 'counter2')
      )
    ]), options, ['counter1']);
}

