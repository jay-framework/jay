import {JayElement, element as e, ConstructContext, RenderElementOptions} from "jay-runtime";
import {mainRoot as mr} from '../../../../lib/main/main-root'
import {Comp} from './comp';
import {secureChildComp} from "../../../../lib/main/main-child-comp";

export interface AppViewState {
}

export interface AppRefs {}

export type AppElement = JayElement<AppViewState, AppRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    mr(viewState, () =>
      e('div', {}, [
          secureChildComp(Comp, vs => ({}), 'comp1')
      ])
    ), options);
}