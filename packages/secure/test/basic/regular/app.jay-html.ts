import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { BasicRef } from './basic-refs';
import { Basic } from './basic';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: BasicRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const comp1 = cr('comp1');
            return e('div', {}, [
                childComp(
                    Basic,
                    (vs: AppViewState) => ({ safe: '', firstName: 'John', lastName: 'Smith' }),
                    comp1(),
                ),
            ])
        },
        options,
    );
}
