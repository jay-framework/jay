import {JayElement, element as e, conditional as c, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
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

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      c(vs => vs.cond,
        childComp(Counter, vs => ({title: 'conditional counter', initialCount: vs.initialCount}))
      ),
      forEach(vs => vs.counters, (vs1: Counter) => {
        return childComp(Counter, vs => ({title: `collection counter ${vs.id}`, initialCount: vs.initialCount}))}, 'id')
    ]), options);
}