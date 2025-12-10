import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicProperty as dp,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface StyleBindingsViewState {
    text: string;
    color: string;
    width: string;
    fontSize: number;
}

export interface StyleBindingsElementRefs {}

export type StyleBindingsSlowViewState = {};
export type StyleBindingsFastViewState = {};
export type StyleBindingsInteractiveViewState = StyleBindingsViewState;

export type StyleBindingsElement = JayElement<StyleBindingsViewState, StyleBindingsElementRefs>;
export type StyleBindingsElementRender = RenderElement<
    StyleBindingsViewState,
    StyleBindingsElementRefs,
    StyleBindingsElement
>;
export type StyleBindingsElementPreRender = [StyleBindingsElementRefs, StyleBindingsElementRender];
export type StyleBindingsContract = JayContract<
    StyleBindingsViewState,
    StyleBindingsElementRefs,
    StyleBindingsSlowViewState,
    StyleBindingsFastViewState,
    StyleBindingsInteractiveViewState
>;

export function render(options?: RenderElementOptions): StyleBindingsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: StyleBindingsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', { style: { color: dp((vs) => vs.color), width: dp((vs) => vs.width) } }, [
                    dt((vs) => vs.text),
                ]),
                e(
                    'div',
                    { style: { margin: '10px', color: dp((vs) => vs.color), padding: '20px' } },
                    [dt((vs) => vs.text)],
                ),
                e(
                    'div',
                    {
                        style: {
                            backgroundColor: dp((vs) => vs.color),
                            fontSize: dp((vs) => `${vs.fontSize}px`),
                        },
                    },
                    [dt((vs) => vs.text)],
                ),
                e('div', { style: { cssText: 'background: red; padding: 10px' } }, [
                    dt((vs) => vs.text),
                ]),
            ]),
        ) as StyleBindingsElement;
    return [refManager.getPublicAPI() as StyleBindingsElementRefs, render];
}
