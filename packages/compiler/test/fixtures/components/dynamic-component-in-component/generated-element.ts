import {JayElement, element as e, conditional as c, dynamicElement as de, forEach, ConstructContext, childComp, compRef as cr, compCollectionRef as ccr, RenderElementOptions} from "jay-runtime";
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

export interface DynamicComponentInComponentElementRefs {
  counter1: CounterRefs<NestedCounter>,
  counter2: CounterRef<DynamicComponentInComponentViewState>
}

export type DynamicComponentInComponentElement = JayElement<DynamicComponentInComponentViewState, DynamicComponentInComponentElementRefs>

export function render(viewState: DynamicComponentInComponentViewState, options?: RenderElementOptions): DynamicComponentInComponentElement {
  return ConstructContext.withRootContext(viewState, () => {
    const refCounter1 = ccr('counter1');
    return de('div', {}, [
      forEach(vs => vs.nestedCounters, (vs1: NestedCounter) => {
        return childComp(Counter, (vs: NestedCounter) => ({initialValue: vs.counter}), refCounter1())}, 'id'),
      c(vs => vs.condition,
        childComp(Counter, (vs: DynamicComponentInComponentViewState) => ({initialValue: vs.count1}), cr('counter2'))
      )
    ])}, options);
}

