import {
    JayElement,
    dynamicProperty as dp,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface StyleBindingsViewState {
    text: string;
    color: string;
    width: string;
    fontSize: number;
}

export interface StyleBindingsElementRefs {}

export type StyleBindingsSlowViewState = {};
export type StyleBindingsFastViewState = StyleBindingsViewState;
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): StyleBindingsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: StyleBindingsViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptElement(
                    'S0/0/0',
                    { style: { color: dp((vs) => vs.color), width: dp((vs) => vs.width) } },
                    [adoptText('S0/0/0', (vs) => vs.text)],
                ),
                adoptElement(
                    'S0/0/1',
                    { style: { margin: '10px', color: dp((vs) => vs.color), padding: '20px' } },
                    [adoptText('S0/0/1', (vs) => vs.text)],
                ),
                adoptElement(
                    'S0/0/2',
                    {
                        style: {
                            backgroundColor: dp((vs) => vs.color),
                            fontSize: dp((vs) => `${vs.fontSize}px`),
                        },
                    },
                    [adoptText('S0/0/2', (vs) => vs.text)],
                ),
                adoptText('S0/0/3', (vs) => vs.text),
                adoptText('S0/0/4', (vs) => vs.text),
            ]),
        ) as StyleBindingsElement;
    return [refManager.getPublicAPI() as StyleBindingsElementRefs, render];
}
