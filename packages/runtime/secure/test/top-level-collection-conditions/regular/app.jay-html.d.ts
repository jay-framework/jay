import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import { CounterComponentType, CounterRefs } from './counter-refs';
import { Counter } from './counter';

export interface Counter {
    id: string;
    initialCount: number;
}

export interface AppViewState {
    cond: boolean;
    initialCount: number;
    counters: Array<Counter>;
}

export interface AppElementRefs {
    comp1: CounterComponentType<AppViewState>;
    comp2: CounterRefs<Counter>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export declare function render(options?: RenderElementOptions): AppElementPreRender;
