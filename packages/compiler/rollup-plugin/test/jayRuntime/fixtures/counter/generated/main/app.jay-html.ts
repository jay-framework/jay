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
import { funcRepository } from './function-repository';
import { CounterComponentType } from './counter-refs';
// @ts-expect-error Cannot find module
import { Counter } from './counter?jay-mainSandbox';

export interface AppViewState {
    incrementBy: number;
}

export interface AppElementRefs {
    a: CounterComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [refA]] = ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            mr(
                viewState,
                () =>
                    e('div', {}, [
                        secureChildComp(
                            Counter,
                            (vs: AppViewState) => ({
                                initialValue: 12,
                                incrementBy: vs.incrementBy,
                            }),
                            refA(),
                        ),
                    ]),
                funcRepository,
            ),
        ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
