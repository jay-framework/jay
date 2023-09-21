import { JayElement, RenderElementOptions } from 'jay-runtime';
import { CounterRef, CounterRefs } from './counter-refs';
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
    comp1: CounterRef<AppViewState>;
    comp2: CounterRefs<Counter>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement;
