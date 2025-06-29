import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
} from '@jay-framework/runtime';
import { mainRoot as mr } from '../../../../lib/';
import { Basic } from './basic';
import { secureChildComp } from '../../../../lib';

export interface AppViewState {
    firstName: string;
    lastName: string;
}

export type BasicRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Basic>>;
export interface AppElementRefs {
    comp1: BasicRef<AppViewState>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
type AppElementPreRender = [AppElementRefs, AppElementRender];

export function renderAppElement(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1]] = ReferencesManager.for(options, [], [], ['comp1'], []);
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return mr(viewState, () =>
                e('div', {}, [
                    secureChildComp(
                        Basic,
                        (vs: AppViewState) => ({
                            safe: '',
                            firstName: vs.firstName,
                            lastName: vs.lastName,
                        }),
                        comp1(),
                    ),
                ]),
            );
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
