import {JayElement, element as e, conditional as c, dynamicElement as de, forEach, ConstructContext, ComponentCollectionProxy, childComp, RenderElementOptions} from "jay-runtime";
import {Counter} from '../counter/counter';

export interface CounterComponent {
  counter: number,
  id: string
}

export interface DynamicComponentInComponentViewState {
  counterComponents: Array<CounterComponent>,
  condition: boolean,
  count1: number
}

export interface DynamicComponentInComponentRefs {
  counter1: ComponentCollectionProxy<CounterComponent, ReturnType<typeof Counter>>,
  counter2: ReturnType<typeof Counter>
}

export type DynamicComponentInComponentElement = JayElement<DynamicComponentInComponentViewState, DynamicComponentInComponentRefs>

export function render(viewState: DynamicComponentInComponentViewState, options?: RenderElementOptions): DynamicComponentInComponentElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      forEach(vs => vs.counterComponents, (vs1: CounterComponent) => {
        return childComp(Counter, vs => ({initialValue: vs.counter}), 'counter1')}, 'id'),
      c(vs => vs.condition,
        childComp(Counter, vs => ({initialValue: vs.count1}), 'counter2')
      )
    ]), options, ['counter1']);
}

