import {JayElement, element as e, ConstructContext, childComp} from "jay-runtime";
import {Counter} from '../counter/counter';

export interface ComponentInComponentViewState {
  count1: number,
  count2: number,
  count3: number
}

export interface ComponentInComponentRefs {}

export type ComponentInComponentElement = JayElement<ComponentInComponentViewState, ComponentInComponentRefs>

export function render(viewState: ComponentInComponentViewState): ComponentInComponentElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      childComp(Counter, vs => ({initialValue: vs.count1})),
      childComp(Counter, vs => ({initialValue: vs.count2})),
      childComp(Counter, vs => ({initialValue: vs.count3}))
    ]));
}

