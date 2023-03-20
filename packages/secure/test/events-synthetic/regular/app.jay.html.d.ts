import {JayElement, RenderElementOptions} from "jay-runtime";
import {Comp} from './comp';

export interface AppViewState {

}

export interface AppRefs {}

export type AppElement = JayElement<AppViewState, AppRefs>

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement