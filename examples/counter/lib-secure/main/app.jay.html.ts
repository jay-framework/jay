import {
    JayElement,
    element as e,
    ConstructContext,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { mainRoot as mr, secureChildComp } from 'jay-secure';
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
            mr(viewState, () =>
                e('div', {}, [
                    secureChildComp(Counter, (vs: AppViewState) => ({ initialValue: 12 }), cr('a')),
                ]),
            ),
        options,
    );
}
