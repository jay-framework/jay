import {JayElement, element as e, ConstructContext, RenderElementOptions} from "jay-runtime";
import {mainRoot as mr} from '../../../../lib/main/main-root'
import {Basic} from './basic';
import {secureChildComp} from "../../../../lib/main/main-child-comp";

export interface AppViewState {
    firstName: string, lastName: string
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    mr(viewState, () =>
      e('div', {}, [
          secureChildComp(Basic, vs => ({safe: '', firstName: vs.firstName, lastName: vs.lastName}), 'comp1')
      ])
    ), options);
}