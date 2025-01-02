import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    RenderElementOptions,
    RenderElement,
    ReferencesManager, MapEventEmitterViewState,
} from 'jay-runtime';
import { Comp } from './comp';

export interface AppViewState {}

export type CompRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Comp>>;
export interface AppElementRefs {
    comp1: CompRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [childComp(Comp, (vs: AppViewState) => ({ safe: '' }), comp1())]);
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
