import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions, ReferencesManager, RenderElement,
} from 'jay-runtime';
import { mainRoot as mr } from '../../../../lib/';
import { Comp } from './comp';
import { secureChildComp } from '../../../../lib';
import {CompComponentType} from "../../regular/comp-refs";

export interface AppViewState {}

export interface AppElementRefs {
    comp1: CompComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender]

export function preRender(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] =
        ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) =>  ConstructContext.withRootContext(
        viewState, refManager,
        () => {
            return mr(viewState, () => e('div', {}, [secureChildComp(Comp, (vs) => ({}), comp1())]))},
    ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
