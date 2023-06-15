import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, HTMLElementProxy, childComp, RenderElementOptions} from "jay-runtime";
import {ChildRef, ChildRefs} from './child-refs';
import {Child, ChildProps} from './child';
import {secureChildComp} from '../../../../lib/'

export interface DynamicChild {
  id: string,
  childText: string
}

export interface ParentViewState {
  textFromChildEvent: string,
  viewStateFromChildEvent: string,
  coordinateFromChildEvent: string,
  childText: string,
  dynamicChildren: Array<DynamicChild>
}

export interface ParentElementRefs {
  parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
  parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
  staticChild: ChildRef<ParentViewState>,
  dynamicChildren: ChildRefs<DynamicChild>
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>

export function render(viewState: ParentViewState, options?: RenderElementOptions): ParentElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      e('div', {id: 'text-from-child-event'}, [dt(vs => vs.textFromChildEvent)]),
      e('div', {id: 'view-state-from-child-event'}, [dt(vs => vs.viewStateFromChildEvent)]),
      e('div', {id: 'coordinate-from-child-event'}, [dt(vs => vs.coordinateFromChildEvent)]),
      e('button', {id: 'parent-changes-child-prop-button', ref: 'parentChangesChildPropButton'}, ['parent changes child prop']),
      e('button', {id: 'parent-calls-child-api-button', ref: 'parentCallsChildApiButton'}, ['parent calls child api']),
        secureChildComp(Child, vs => ({textFromParent: vs.childText, id: 'static'}), 'staticChild'),
      forEach(vs => vs.dynamicChildren, (vs1: DynamicChild) => {
        return e('div', {}, [
            secureChildComp(Child, vs => ({textFromParent: vs.childText, id: vs.id}), 'dynamicChildren')
        ])}, 'id')
    ]), options, ['dynamicChildren']);
}