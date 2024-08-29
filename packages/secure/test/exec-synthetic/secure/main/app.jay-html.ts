import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions, RenderElement, ReferencesManager,
} from 'jay-runtime';
import { FunctionsRepository, mainRoot as mr } from '../../../../lib/';
import { Comp } from './comp';
import { secureChildComp } from '../../../../lib';

export interface AppViewState {}

export interface AppElementRefs {}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender]

export const funcRepository: FunctionsRepository = {
    '2': () => {
        return document.title;
    },
};

export function preRender(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] =
        ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () =>
            mr(
                viewState,
                () => {
                    return e('div', {}, [secureChildComp(Comp, (vs) => ({}), comp1())])
                },
                funcRepository,
            ),
    ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render]
}
