import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    booleanAttribute as ba,
    dynamicProperty as dp,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface AttributesViewState {
    text: string;
    text2: string;
    text3: string;
    bool1: boolean;
    color: string;
}

export interface AttributesElementRefs {}

export type AttributesElement = JayElement<AttributesViewState, AttributesElementRefs>;
export type AttributesElementRender = RenderElement<
    AttributesViewState,
    AttributesElementRefs,
    AttributesElement
>;
export type AttributesElementPreRender = [AttributesElementRefs, AttributesElementRender];

export function render(options?: RenderElementOptions): AttributesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AttributesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', { style: { cssText: 'background: red;' } }, [dt((vs) => vs.text)]),
                e('div', { 'data-attribute': 'a value' }, ['static']),
                e('input', { value: 'some value' }, []),
                e('input', { id: 'abc', value: dp((vs) => vs.text2) }, []),
                e(
                    'input',
                    {
                        type: 'checkbox',
                        checked: dp((vs) => vs.bool1),
                        value: dp((vs) => vs.text2),
                    },
                    [],
                ),
                e('label', { for: 'abc' }, []),
                e('div', { class: 'main second' }, [dt((vs) => vs.text3)]),
                e('div', { class: da((vs) => `${vs.bool1 ? 'main' : ''}`) }, [
                    dt((vs) => vs.text3),
                ]),
                e('div', { class: da((vs) => `${vs.bool1 ? 'main' : 'second'}`) }, [
                    dt((vs) => vs.text3),
                ]),
                e('div', { 'data-attribute': da((vs) => vs.text) }, []),
                e('div', { 'data-attribute': da((vs) => `${vs.text}-abcd`) }, []),
                e('div', { 'data-attribute': da((vs) => `abcd-${vs.text}`) }, []),
                e('div', { 'data-attribute': da((vs) => `abcd-${vs.text}-abcd`) }, []),
                e('button', { disabled: ba((vs) => vs.bool1) }, []),
                e('button', { disabled: ba((vs) => !vs.bool1) }, []),
                e('button', { disabled: '' }, []),
            ]),
        ) as AttributesElement;
    return [refManager.getPublicAPI() as AttributesElementRefs, render];
}
