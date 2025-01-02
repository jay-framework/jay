import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    RenderElementOptions,
    ReferencesManager,
    RenderElement,
    MapEventEmitterViewState,
} from 'jay-runtime';
import { Counter } from './counter';

export interface AppViewState {}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [a]] = ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [
                childComp(
                    Counter,
                    (vs: AppViewState) => ({ title: 'first counter', initialCount: 12 }),
                    a(),
                ),
            ]);
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
