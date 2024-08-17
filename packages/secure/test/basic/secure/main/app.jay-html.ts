import {
    JayElement,
    element as e,
    ConstructContext,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { mainRoot as mr } from '../../../../lib/';
import { Basic } from './basic';
import { secureChildComp } from '../../../../lib';

export interface AppViewState {
    firstName: string;
    lastName: string;
}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const comp1 = cr('comp1');
            return mr(viewState, () =>
                e('div', {}, [
                    secureChildComp(
                        Basic,
                        (vs: AppViewState) => ({
                            safe: '',
                            firstName: vs.firstName,
                            lastName: vs.lastName,
                        }),
                        comp1(),
                    ),
                ]),
            )
        },
        options,
    );
}
