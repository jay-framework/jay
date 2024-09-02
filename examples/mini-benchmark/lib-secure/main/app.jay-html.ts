import {
    JayElement,
    ConstructContext,
    RenderElementOptions,
    ReferencesManager,
    RenderElement,
} from 'jay-runtime';
import { Main, MainProps } from './main';
import { FunctionsRepository, mainRoot as mr } from 'jay-secure';
import { secureChildComp } from 'jay-secure';

export interface AppViewState {}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export const funcRepository: FunctionsRepository = {
    '3': () => new Promise((resolve) => requestAnimationFrame(resolve)),
};

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [refA]] = ReferencesManager.for(options, [], [], ['a'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            mr(viewState, () => secureChildComp(Main, (vs) => ({}), refA()), funcRepository),
        ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
