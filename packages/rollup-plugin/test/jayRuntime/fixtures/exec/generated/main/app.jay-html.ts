import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import {FunctionsRepository, mainRoot as mr, secureChildComp} from 'jay-secure';
import { AutoCounterComponentType } from './auto-counter-refs';
import { AutoCounter } from './auto-counter.ts?jay-mainSandbox';

export interface AppViewState {
    incrementBy: number;
}

export interface AppElementRefs {
    a: AutoCounterComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export const funcRepository: FunctionsRepository = {
    '1': () => new Promise((resolve) => requestAnimationFrame(resolve)),
    '2': () => new Promise((resolve) => requestAnimationFrame(resolve)),
};

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [refA]] = ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            mr(viewState, () =>
                e('div', {}, [
                    secureChildComp(
                        AutoCounter,
                        (vs: AppViewState) => ({ initialValue: 12 }),
                        refA(),
                    ),
                ]),
                funcRepository
            ),
        ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
