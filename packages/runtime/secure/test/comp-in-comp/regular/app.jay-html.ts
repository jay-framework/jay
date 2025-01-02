import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    RenderElementOptions,
    RenderElement,
    ReferencesManager, MapEventEmitterViewState,
} from 'jay-runtime';
import { Parent } from './parent';

export interface AppViewState {}

export type ParentRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Parent>>;
export interface AppElementRefs {
    comp1: ParentRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [childComp(Parent, (vs: AppViewState) => ({ safe: '' }), comp1())]);
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
