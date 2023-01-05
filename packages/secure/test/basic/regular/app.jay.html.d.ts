import {JayElement, RenderElementOptions} from "jay-runtime";
import {Basic} from './basic';

export interface AppViewState {

}

export interface AppRefs {}

export type AppElement = JayElement<AppViewState, AppRefs>

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement