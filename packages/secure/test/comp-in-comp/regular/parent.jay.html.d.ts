import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {ChildRef} from './child-refs';
import {Child, ChildProps} from './child';

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

export declare function render(viewState: ParentViewState, options?: RenderElementOptions): ParentElement