import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import { CounterRef } from './counter-refs';
import { Counter } from './counter';

export interface AppViewState {
    incrementBy: number;
}

export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export declare function render(options?: RenderElementOptions): AppElementPreRender;
