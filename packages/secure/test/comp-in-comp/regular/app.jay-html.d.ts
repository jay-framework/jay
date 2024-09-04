import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import { ParentComponentType } from './parent-refs';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: ParentComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export declare function render(options?: RenderElementOptions): AppElementPreRender;
