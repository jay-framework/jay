import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {Basic} from './basic';

export interface AppViewState {
    firstName: string, lastName: string
}

export interface AppRefs {}

export type AppElement = JayElement<AppViewState, AppRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      childComp(Basic, vs => ({safe: '', firstName: vs.firstName, lastName: vs.lastName}))
    ]), options);
}