import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
} from '@jay-framework/runtime';
import { mainRoot as mr, secureChildComp } from '@jay-framework/secure';
import { funcRepository } from './function-repository';
// @ts-expect-error Cannot find module
import { AutoCounter } from './auto-counter?jay-mainSandbox';

export interface AppViewState {
    incrementBy: number;
}

export type AutoCounterRef<ParentVS> = MapEventEmitterViewState<
    ParentVS,
    ReturnType<typeof AutoCounter>
>;
export interface AppElementRefs {
    a: AutoCounterRef<AppViewState>;
}


export type AppSlowViewState = {};
export type AppFastViewState = {};
export type AppInteractiveViewState = AppViewState;

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];
export type AppContract = JayContract<
    AppViewState,
    AppElementRefs,
    AppSlowViewState,
    AppFastViewState,
    AppInteractiveViewState
>;

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
