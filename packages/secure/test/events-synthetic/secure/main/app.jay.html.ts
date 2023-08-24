import {JayElement, element as e, ConstructContext, compRef as cr, RenderElementOptions} from "jay-runtime";
import {mainRoot as mr} from '../../../../lib/'
import {Comp} from './comp';
import {secureChildComp} from "../../../../lib";

export interface AppViewState {
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    mr(viewState, () =>
      e('div', {}, [
          secureChildComp(Comp, vs => ({}), cr('comp1'))
      ])
    ), options);
}