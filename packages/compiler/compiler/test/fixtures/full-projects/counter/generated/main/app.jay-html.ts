import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
} from 'jay-runtime';
import { mainRoot as mr, secureChildComp } from 'jay-secure';
import { funcRepository } from './function-repository';
// @ts-expect-error Cannot find module
import { Counter } from './counter?jay-mainSandbox';

export interface AppViewState {
    incrementBy: number;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];
export type AppContract = JayContract<AppViewState, AppElementRefs>;

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [refA]] = ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            mr(
                viewState,
                () =>
                    e('div', {}, [
                        e(
                            'input',
                            {
                                type: 'number',
                                id: 'interval',
                                name: 'increment',
                                min: '1',
                                max: '100',
                            },
                            [],
                        ),
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
