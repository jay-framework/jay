import { JayElement, RenderElementOptions } from 'jay-runtime';
import { Counter } from './counter';

export interface AppViewState {}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement;
