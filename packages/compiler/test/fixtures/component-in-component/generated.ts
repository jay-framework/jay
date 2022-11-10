import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {Counter} from '../counter/counter';
import {CounterViewState as CounterData} from '../counter/generated';

export interface ComponentInComponentViewState {
  count1: number,
  count2: number,
  count3: number,
  count4: CounterData
}

export interface ComponentInComponentRefs {
  counter1: ReturnType<typeof Counter>,
  counterTwo: ReturnType<typeof Counter>
}

export type ComponentInComponentElement = JayElement<ComponentInComponentViewState, ComponentInComponentRefs>

export function render(viewState: ComponentInComponentViewState, options?: RenderElementOptions): ComponentInComponentElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      childComp(Counter, vs => ({initialValue: vs.count1}), 'counter1'),
      childComp(Counter, vs => ({initialValue: `${vs.count2} + 2`}), 'counterTwo'),
      childComp(Counter, vs => ({initialValue: `${vs.count1} + ${vs.count2}`})),
      childComp(Counter, vs => ({initialValue: '12'})),
      childComp(Counter, vs => ({initialValue: vs.count4.count}))
    ]), options);
}

