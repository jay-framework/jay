import { JayElement, RenderElementOptions } from 'jay-runtime';
import { CompRef } from './comp-refs';
import { Comp } from './comp';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: CompRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement;
