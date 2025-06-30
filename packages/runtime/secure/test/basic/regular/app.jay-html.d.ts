import { JayElement, RenderElement, RenderElementOptions } from '@jay-framework/runtime';
import { BasicRef } from './basic-refs';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: BasicRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export declare function render(
    viewState: AppViewState,
    options?: RenderElementOptions,
): AppElementPreRender;
