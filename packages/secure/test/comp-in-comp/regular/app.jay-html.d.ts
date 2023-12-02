import { JayElement, RenderElementOptions } from 'jay-runtime';
import { ParentRef } from './parent-refs';
import { Parent } from './parent';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: ParentRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement;
