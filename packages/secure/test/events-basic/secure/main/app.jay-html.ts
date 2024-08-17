import {
    JayElement,
    element as e,
    ConstructContext,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { Counter } from './counter';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib';

export interface AppViewState {}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const a = cr('a');
            return mr(viewState, () =>
                e('div', {}, [
                    secureChildComp(
                        Counter,
                        (vs) => ({ title: 'first counter', initialCount: 12 }),
                        a(),
                    ),
                ]),
            )},
        options,
    );
}
