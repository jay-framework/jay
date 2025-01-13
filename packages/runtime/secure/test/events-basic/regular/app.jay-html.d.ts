import {
    JayElement,
    MapEventEmitterViewState,
    RenderElement,
    RenderElementOptions,
} from 'jay-runtime';
import { Counter } from './counter';

export interface AppViewState {}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export declare function render(
    viewState: AppViewState,
    options?: RenderElementOptions,
): AppElementPreRender;
