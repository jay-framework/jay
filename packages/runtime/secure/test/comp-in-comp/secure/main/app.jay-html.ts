import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from '@jay-framework/runtime';
import { Parent } from './parent';
import { mainRoot as mr, secureChildComp } from '../../../../lib/';

export interface AppViewState {}

export interface AppElementRefs {}
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export type AppElement = JayElement<AppViewState, AppElementRefs>;

export function renderAppElement(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return mr(viewState, () =>
                e('div', {}, [secureChildComp(Parent, (vs) => ({ safe: '' }), comp1())]),
            );
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
