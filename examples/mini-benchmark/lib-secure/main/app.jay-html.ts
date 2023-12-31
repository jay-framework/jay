import { JayElement, ConstructContext, RenderElementOptions, compRef } from 'jay-runtime';
import { Main, MainProps } from './main';
import {FunctionsRepository, mainRoot as mr} from 'jay-secure';
import { secureChildComp } from 'jay-secure';

export interface AppViewState {}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export const funcRepository: FunctionsRepository = {
    '3': () => new Promise((resolve) => requestAnimationFrame(resolve)),
};

export function render(viewState: AppViewState, options?: RenderElementOptions): AppElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            mr(viewState, () => secureChildComp(Main, (vs) => ({}), compRef('a')), funcRepository),
        options,
    );
}
