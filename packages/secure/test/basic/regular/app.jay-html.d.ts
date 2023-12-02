import { JayElement, RenderElementOptions } from 'jay-runtime';
import { BasicRef } from './basic-refs';
import { Basic } from './basic';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: BasicRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement;
