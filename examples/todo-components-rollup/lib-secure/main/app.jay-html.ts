import {
    JayElement,
    ConstructContext,
    RenderElementOptions,
    RenderElement,
    ReferencesManager
} from 'jay-runtime';
import { Todo, TodoProps } from './todo';
import { mainRoot as mr } from 'jay-secure';
import { secureChildComp } from 'jay-secure';

export interface AppViewState {
    todos: TodoProps;
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender]

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [refA]] =
        ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => mr(viewState, () => secureChildComp(Todo, (vs) => ({}), refA())),
    ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render]
}
