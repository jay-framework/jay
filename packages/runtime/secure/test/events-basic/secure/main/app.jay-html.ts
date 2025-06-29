import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
} from '@jay-framework/runtime';
import { Counter } from './counter';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib';

export interface AppViewState {}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function renderAppElement(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [a]] = ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return mr(viewState, () =>
                e('div', {}, [
                    secureChildComp(
                        Counter,
                        (vs) => ({ title: 'first counter', initialCount: 12 }),
                        a(),
                    ),
                ]),
            );
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
