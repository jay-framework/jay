import {JayElement, ConstructContext, RenderElementOptions} from "jay-runtime";
import {Counter} from './counter';
import {mainRoot as mr} from "jay-secure";
import {secureChildComp} from "jay-secure";

export interface AppViewState {

}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(viewState, () =>
        mr(viewState, () =>
            secureChildComp(Counter, vs => ({title: 'first counter', initialCount: 12}), 'a')
        ), options);
}