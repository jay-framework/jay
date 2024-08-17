import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { ParentRef } from './parent-refs';
import { Parent } from './parent';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: ParentRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const comp1 = cr('comp1');
            return e('div', {}, [childComp(Parent, (vs: AppViewState) => ({ safe: '' }), comp1())])
        },
        options,
    );
}
