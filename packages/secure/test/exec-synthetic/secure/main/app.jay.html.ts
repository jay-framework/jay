import {JayElement, element as e, ConstructContext, RenderElementOptions} from "jay-runtime";
import {mainRoot as mr} from '../../../../lib/main/main-root'
import {Comp} from './comp';
import {secureChildComp} from "../../../../lib";
import {funcRepository} from "./native-funcs";

export interface AppViewState {
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    mr(viewState, () =>
      e('div', {}, [
          secureChildComp(Comp, vs => ({}), 'comp1')
      ]), funcRepository
    ), options);
}