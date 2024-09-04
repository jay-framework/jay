import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from 'jay-runtime';
import { BasicComponentType } from './basic-refs';
import { Basic } from './basic';

export interface AppViewState {}

export interface AppElementRefs {
    comp1: BasicComponentType<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [
                childComp(
                    Basic,
                    (vs: AppViewState) => ({ safe: '', firstName: 'John', lastName: 'Smith' }),
                    comp1(),
                ),
            ]);
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
