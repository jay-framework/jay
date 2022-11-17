import {JayElement, element as e, conditional as c, dynamicElement as de, forEach, ConstructContext, ComponentCollectionProxy, childComp, RenderElementOptions} from "jay-runtime";
import {Counter} from '../counter/counter';
import {CounterComponent, CounterComponentCollection} from "../counter/counter-types";

export interface CounterComponentViewState {
  counter: number,
  id: string
}

export interface DynamicComponentInComponentViewState {
  counterComponents: Array<CounterComponentViewState>,
  condition: boolean,
  count1: number
}

export interface DynamicComponentInComponentRefs {
  counter1: CounterComponentCollection<DynamicComponentInComponentViewState>,
  counter2: CounterComponent<DynamicComponentInComponentViewState>
}

export type DynamicComponentInComponentElement = JayElement<DynamicComponentInComponentViewState, DynamicComponentInComponentRefs>

export function render(viewState: DynamicComponentInComponentViewState, options?: RenderElementOptions): DynamicComponentInComponentElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      forEach(vs => vs.counterComponents, (vs1: CounterComponentViewState) => {
        return childComp(Counter, vs => ({initialValue: vs.counter}), 'counter1')}, 'id'),
      c(vs => vs.condition,
        childComp(Counter, vs => ({initialValue: vs.count1}), 'counter2')
      )
    ]), options, ['counter1']);
}

