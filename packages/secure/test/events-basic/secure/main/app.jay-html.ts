import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from 'jay-runtime';
import { Counter } from './counter';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib';
import { CounterComponentType } from '../../regular/counter-refs';

export interface AppViewState {}

export interface AppElementRefs {
    a: CounterComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

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
