import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {Counter} from './counter';

export interface AppViewState {

}

export interface AppRefs {}

export type AppElement = JayElement<AppViewState, AppRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      childComp(Counter, vs => ({title: 'first counter', initialCount: '12'}))
    ]), options);
}