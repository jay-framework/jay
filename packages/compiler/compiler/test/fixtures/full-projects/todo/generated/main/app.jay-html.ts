import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import { mainRoot as mr, secureChildComp } from 'jay-secure';
// @ts-expect-error Cannot find module
import { TodoComponent, TodoProps } from './todo?jay-mainSandbox';
import { funcRepository } from './function-repository';

export interface AppViewState {
    todoProps: TodoProps;
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            mr(
                viewState,
                () =>
                    e('div', {}, [
                        secureChildComp(
                            TodoComponent,
                            (vs: AppViewState) => vs.todoProps,
                            refAR1(),
                        ),
                    ]),
                funcRepository,
            ),
        ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
