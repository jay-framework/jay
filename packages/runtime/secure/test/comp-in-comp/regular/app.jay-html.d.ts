import {JayElement, MapEventEmitterViewState, RenderElement, RenderElementOptions} from 'jay-runtime';
import {Parent} from "./parent";

export interface AppViewState {}

export type ParentRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Parent>>;
export interface AppElementRefs {
    comp1: ParentRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export declare function render(options?: RenderElementOptions): AppElementPreRender;
