import {JayElement, RenderElementOptions} from "jay-runtime";
import {Parent} from './parent';

export interface AppViewState {

}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export declare function render(viewState: AppViewState, options?: RenderElementOptions): AppElement