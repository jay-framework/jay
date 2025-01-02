import {
    ComponentCollectionProxy,
    JayElement,
    MapEventEmitterViewState, OnlyEventEmitters,
    RenderElement,
    RenderElementOptions
} from 'jay-runtime';
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

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;
export interface AppElementRefs {
    comp1: CounterRef<AppViewState>;
    comp2: CounterRefs<Counter>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export declare function render(options?: RenderElementOptions): AppElementPreRender;
