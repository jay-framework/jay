import { LabelAndButtonComp } from './label-and-button-component';
import {
    childComp,
    ConstructContext,
    element as e,
    HTMLElementProxy,
    JayElement,
    ReferencesManager,
    RenderElement,
    RenderElementOptions,
} from 'jay-runtime';

export interface AppViewState {}
export interface AppRefs {
    button: HTMLElementProxy<AppViewState, HTMLButtonElement>;
    labelAndButton: ReturnType<typeof LabelAndButtonComp>;
}
export interface AppElement extends JayElement<AppViewState, AppRefs> {}
export type AppElementRender = RenderElement<AppViewState, AppRefs, AppElement>;
export type AppElementPreRender = [refs: AppRefs, AppElementRender];

export function AppElement(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [button, labelAndButton]] = ReferencesManager.for(
        options,
        ['button'],
        [],
        ['labelAndButton'],
        [],
    );
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [
                childComp(LabelAndButtonComp, (vs) => ({}), labelAndButton()),
                e('button', { id: 'parent-button' }, ['inc'], button()),
            ]);
        }) as AppElement;
    return [refManager.getPublicAPI() as AppRefs, render];
}
