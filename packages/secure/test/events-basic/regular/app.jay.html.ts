import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {Counter} from './counter';

export interface AppViewState {

}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      childComp(Counter, vs => ({title: 'first counter', initialCount: 12}))
    ]), options);
}