import {JayElement, element as e, ConstructContext, RenderElementOptions} from "jay-runtime";
import {mainRoot as cr} from '../../../../lib/main/main-root'
import {Basic} from './basic';
import {secureChildComp} from "../../../../lib/main/main-child-comp";

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