import {JayElement, RenderElement, RenderElementOptions} from 'jay-runtime';
import {CompComponentType} from "./comp-refs";

export interface AppViewState {}

export interface AppElementRefs {
    comp1: CompComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender]

export declare function render(options?: RenderElementOptions): AppElementPreRender;
