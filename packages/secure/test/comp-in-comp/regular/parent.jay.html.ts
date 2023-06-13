import {JayElement, element as e, dynamicText as dt, ConstructContext, HTMLElementProxy, childComp, RenderElementOptions} from "jay-runtime";
import {ChildRef} from './child-refs';
import {Child, ChildProps} from './child';

export interface ParentViewState {
  text: string,
  childText: string
}

export interface ParentElementRefs {
  button: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
  child: ChildRef<ParentViewState>
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>

export function render(viewState: ParentViewState, options?: RenderElementOptions): ParentElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.text)]),
      e('button', {ref: 'button'}, ['click']),
      childComp(Child, vs => ({textFromParent: 'childText'}), 'child')
    ]), options);
}