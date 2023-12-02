import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { CounterRef } from './counter-refs';
import { Counter } from './counter';

export interface AppViewState {}

export interface AppElementRefs {
    a: CounterRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            e('div', {}, [
                childComp(
                    Counter,
                    (vs: AppViewState) => ({ title: 'first counter', initialCount: 12 }),
                    cr('a'),
                ),
            ]),
        options,
    );
}
