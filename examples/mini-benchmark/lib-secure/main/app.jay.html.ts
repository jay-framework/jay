import {JayElement, ConstructContext, RenderElementOptions} from "jay-runtime";
import {Main, MainProps} from './main';
import {mainRoot as mr} from "jay-secure";
import {secureChildComp} from "jay-secure";
import {funcRepository} from "./native-funcs";

export interface AppViewState {
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(viewState, () =>
        mr(viewState, () =>
            secureChildComp(Main, vs => ({}), 'a')
        , funcRepository), options);
}