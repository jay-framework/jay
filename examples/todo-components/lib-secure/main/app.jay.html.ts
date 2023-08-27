import {JayElement, ConstructContext, RenderElementOptions, compRef} from "jay-runtime";
import {Todo, TodoProps} from './todo';
import {mainRoot as mr} from "jay-secure";
import {secureChildComp} from "jay-secure";

export interface AppViewState {
    todos: TodoProps
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(viewState, () =>
        mr(viewState, () =>
            secureChildComp(Todo, vs => ({}), compRef('a'))
        ), options);
}