import {JayElement, RenderElement, RenderElementOptions} from 'jay-runtime';
import {CounterComponentType} from './counter-refs';

export interface AppViewState {}

export interface AppElementRefs {
    a: CounterComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender]

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElementPreRender;
