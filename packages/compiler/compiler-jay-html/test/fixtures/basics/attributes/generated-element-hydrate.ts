import {
    JayElement,
    dynamicAttribute as da,
    booleanAttribute as ba,
    dynamicProperty as dp,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface AttributesViewState {
    text: string;
    text2: string;
    text3: string;
    bool1: boolean;
    color: string;
}

export interface AttributesElementRefs {}

export type AttributesSlowViewState = {};
export type AttributesFastViewState = {};
export type AttributesInteractiveViewState = AttributesViewState;

export type AttributesElement = JayElement<AttributesViewState, AttributesElementRefs>;
export type AttributesElementRender = RenderElement<
    AttributesViewState,
    AttributesElementRefs,
    AttributesElement
>;
export type AttributesElementPreRender = [AttributesElementRefs, AttributesElementRender];
export type AttributesContract = JayContract<
    AttributesViewState,
    AttributesElementRefs,
    AttributesSlowViewState,
    AttributesFastViewState,
    AttributesInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): AttributesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AttributesViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('1', (vs) => vs.text),
                adoptElement('2', { value: dp((vs) => vs.text2) }, []),
                adoptElement(
                    '3',
                    { checked: dp((vs) => vs.bool1), value: dp((vs) => vs.text2) },
                    [],
                ),
                adoptText('4', (vs) => vs.text3),
                adoptElement('5', { class: da((vs) => `${vs.bool1 ? 'main' : ''}`) }, [
                    adoptText('5', (vs) => vs.text3),
                ]),
                adoptElement('6', { class: da((vs) => `${vs.bool1 ? 'main' : 'second'}`) }, [
                    adoptText('6', (vs) => vs.text3),
                ]),
                adoptElement(
                    '7',
                    {
                        class: da(
                            (vs) =>
                                `first-class ${vs.bool1 ? 'main' : 'second'} ${!vs.bool1 ? 'third' : 'forth'}`,
                        ),
                    },
                    [adoptText('7', (vs) => vs.text3)],
                ),
                adoptElement('8', { 'data-attribute': da((vs) => vs.text) }, []),
                adoptElement('9', { 'data-attribute': da((vs) => `${vs.text}-abcd`) }, []),
                adoptElement('10', { 'data-attribute': da((vs) => `abcd-${vs.text}`) }, []),
                adoptElement('11', { 'data-attribute': da((vs) => `abcd-${vs.text}-abcd`) }, []),
                adoptElement('12', { disabled: ba((vs) => vs.bool1) }, []),
                adoptElement('13', { disabled: ba((vs) => !vs.bool1) }, []),
            ]),
        ) as AttributesElement;
    return [refManager.getPublicAPI() as AttributesElementRefs, render];
}
