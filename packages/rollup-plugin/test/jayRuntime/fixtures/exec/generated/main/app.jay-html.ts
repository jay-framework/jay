import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import { mainRoot as mr, secureChildComp } from 'jay-secure';
import { AutoCounterComponentType } from './auto-counter-refs';
import { AutoCounter } from './auto-counter?jay-mainSandbox';
import { funcRepository } from './function-repository';

export interface AppViewState {
    incrementBy: number;
}

export interface AppElementRefs {
    a: AutoCounterComponentType<AppViewState>;
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
                            AutoCounter,
                            (vs: AppViewState) => ({ initialValue: 12 }),
                            refA(),
                        ),
                    ]),
                funcRepository,
            ),
        ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
