import {
    JayElement,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from 'jay-runtime';
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

export type ChildRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Child>>;
export type ChildRefs<ParentVS> = ComponentCollectionProxy<ParentVS, ChildRef<ParentVS>> &
    OnlyEventEmitters<ChildRef<ParentVS>>;
export interface ParentElementRefs {
    parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    staticChild: ChildRef<ParentViewState>;
    dynamicChildren: ChildRefs<DynamicChild>;
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>;
export type ParentElementRender = RenderElement<ParentViewState, ParentElementRefs, ParentElement>;
export type ParentElementPreRender = [ParentElementRefs, ParentElementRender];

export declare function render(options?: RenderElementOptions): ParentElementPreRender;
