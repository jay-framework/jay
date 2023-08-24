import {JayElement, element as e, ConstructContext, childComp, compRef as cr, RenderElementOptions} from "jay-runtime";
import {CompRef} from './comp-refs';
import {Comp} from './comp';

export interface AppViewState {

}

export interface AppElementRefs {
  comp1: CompRef<AppViewState>
}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      childComp(Comp, (vs: AppViewState) => ({safe: ''}), cr('comp1'))
    ]), options);
}