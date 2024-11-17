import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    RenderElementOptions,
    ReferencesManager,
    RenderElement,
} from 'jay-runtime';
import { CounterComponentType } from './counter-refs';
import { Counter } from './counter';

export interface AppViewState {}

export interface AppElementRefs {
    a: CounterComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

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
