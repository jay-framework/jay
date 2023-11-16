import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, HTMLElementProxy, childComp, elemRef as er, compRef as cr, compCollectionRef as ccr, RenderElementOptions} from "jay-runtime";
import {ChildRef, ChildRefs} from "./child-refs";
import {Child, ChildProps} from "./child";

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
  return ConstructContext.withRootContext(viewState, () => {
    const refDynamicChildren = ccr('dynamicChildren');
    return de('div', {}, [
      e('div', {id: 'text-from-child-event'}, [dt(vs => vs.textFromChildEvent)]),
      e('div', {id: 'view-state-from-child-event'}, [dt(vs => vs.viewStateFromChildEvent)]),
      e('div', {id: 'coordinate-from-child-event'}, [dt(vs => vs.coordinateFromChildEvent)]),
      e('button', {id: 'parent-changes-child-prop-button'}, [' parent changes child prop '], er('parentChangesChildPropButton')),
      e('button', {id: 'parent-calls-child-api-button'}, [' parent calls child api '], er('parentCallsChildApiButton')),
      childComp(Child, (vs: ParentViewState) => ({textFromParent: vs.childText, id: 'static'}), cr('staticChild')),
      forEach(vs => vs.dynamicChildren, (vs1: DynamicChild) => {
        return e('div', {}, [
          childComp(Child, (vs: DynamicChild) => ({textFromParent: vs.childText, id: vs.id}), refDynamicChildren())
        ])}, 'id')
    ])}, options);
}