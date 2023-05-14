import {JayElement, element as e, conditional as c, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {CounterRef, CounterRefs} from './counter-refs';
import {Counter} from './counter';

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
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      c(vs => vs.cond,
        childComp(Counter, vs => ({title: 'conditional counter', initialCount: vs.initialCount, id: 'cond'}), 'comp1')
      ),
      forEach(vs => vs.counters, (vs1: Counter) => {
        return childComp(Counter, vs => ({title: `collection counter ${vs.id}`, initialCount: vs.initialCount, id: vs.id}), 'comp2')}, 'id')
    ]), options, ['comp2']);
}