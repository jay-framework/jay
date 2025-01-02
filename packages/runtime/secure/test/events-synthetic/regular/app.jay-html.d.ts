import {JayElement, MapEventEmitterViewState, RenderElement, RenderElementOptions} from 'jay-runtime';
import {Comp} from "./comp";

export interface AppViewState {}

export type CompRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Comp>>;
export interface AppElementRefs {
    comp1: CompRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export declare function render(options?: RenderElementOptions): AppElementPreRender;
