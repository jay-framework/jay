import {JayElement, element as e, ConstructContext, childComp, RenderElementOptions, compRef as cr} from "jay-runtime";
import {Parent} from './parent';
import {mainRoot as mr, secureChildComp} from '../../../../lib/'

export interface AppViewState {

}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
      mr(viewState, () =>
          e('div', {}, [
              secureChildComp(Parent, vs => ({safe: ''}), cr('comp1'))
          ])
      ), options);
}