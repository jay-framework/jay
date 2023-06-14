import {JayElement, element as e, dynamicText as dt, ConstructContext, HTMLElementProxy, childComp, RenderElementOptions} from "jay-runtime";
import {ChildRef} from './child-refs';
import {Child, ChildProps} from './child';
import {secureChildComp} from '../../../../lib/'

export interface ParentViewState {
  textFromChildEvent: string,
  viewStateFromChildEvent: string,
  coordinateFromChildEvent: string,
  childText: string
}

export interface ParentElementRefs {
  parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
  parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
  child: ChildRef<ParentViewState>
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>

export function render(viewState: ParentViewState, options?: RenderElementOptions): ParentElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {id: 'text-from-child-event'}, [dt(vs => vs.textFromChildEvent)]),
      e('div', {id: 'view-state-from-child-event'}, [dt(vs => vs.viewStateFromChildEvent)]),
      e('div', {id: 'coordinate-from-child-event'}, [dt(vs => vs.coordinateFromChildEvent)]),
      e('button', {id: 'parent-changes-child-prop-button', ref: 'parentChangesChildPropButton'}, ['parent changes child prop']),
      e('button', {id: 'parent-calls-child-api-button', ref: 'parentCallsChildApiButton'}, ['parent calls child api']),
        secureChildComp(Child, vs => ({textFromParent: vs.childText}), 'child')
    ]), options);
}