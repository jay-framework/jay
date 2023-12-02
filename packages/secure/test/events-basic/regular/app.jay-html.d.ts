import { JayElement, RenderElementOptions } from 'jay-runtime';
import { CounterRef } from './counter-refs';
import { Counter } from './counter';

export interface AppViewState {}

export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement;
