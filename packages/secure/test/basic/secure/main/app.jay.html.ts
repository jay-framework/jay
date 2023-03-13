import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {ComponentRoot as cr} from '../../../../lib/component-root'
import {Basic} from './basic';
import {secureChildComp} from "../../../../lib/secure-child-comp";

export interface AppViewState {
    firstName: string, lastName: string
}

export interface AppRefs {}

export type AppElement = JayElement<AppViewState, AppRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    cr(() =>
      e('div', {}, [
          secureChildComp(Basic, vs => ({safe: '', firstName: vs.firstName, lastName: vs.lastName}), 'comp1')
      ])
    ), options);
}