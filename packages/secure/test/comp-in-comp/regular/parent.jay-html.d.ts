import {JayElement, HTMLElementProxy, RenderElementOptions, RenderElement} from 'jay-runtime';
import { ChildRef, ChildRefs } from './child-refs';
import { Child, ChildProps } from './child';

export interface DynamicChild {
    id: string;
    childText: string;
}

export interface ParentViewState {
    textFromChildEvent: string;
    viewStateFromChildEvent: string;
    coordinateFromChildEvent: string;
    childText: string;
    dynamicChildren: Array<DynamicChild>;
}

export interface ParentElementRefs {
    parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    staticChild: ChildRef<ParentViewState>;
    dynamicChildren: ChildRefs<DynamicChild>;
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>;
export type ParentElementRender = RenderElement<ParentViewState, ParentElementRefs, ParentElement>
export type ParentElementPreRender = [refs: ParentElementRefs, ParentElementRender]

export declare function render(
    options?: RenderElementOptions,
): ParentElementPreRender;
