import {
    ConstructContext,
    dynamicText as dt,
    element as e,
    HTMLElementProxy,
    JayElement,
    ReferencesManager,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface LabelAndButtonViewState {
    label: string;
}

export interface LabelAndButtonRefs {
    button: HTMLElementProxy<LabelAndButtonViewState, HTMLButtonElement>;
}
export interface LabelAndButtonElement
    extends JayElement<LabelAndButtonViewState, LabelAndButtonRefs> {}
export type LabelAndButtonElementRender = RenderElement<
    LabelAndButtonViewState,
    LabelAndButtonRefs,
    LabelAndButtonElement
>;
export type LabelAndButtonElementPreRender = [LabelAndButtonRefs, LabelAndButtonElementRender];

export function renderLabelElement(options?: RenderElementOptions): LabelAndButtonElementPreRender {
    const [refManager, [button]] = ReferencesManager.for(options, ['button'], [], [], []);
    const render = (viewState: LabelAndButtonViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return e('div', {}, [
                e('span', { id: 'text' }, [dt((vs) => vs.label)]),
                e('button', { id: 'component-button' }, ['inc'], button()),
            ]);
        }) as LabelAndButtonElement;
    return [refManager.getPublicAPI() as LabelAndButtonRefs, render];
}
