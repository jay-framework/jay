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
export type AttributesFastViewState = AttributesViewState;
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
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.text),
                adoptElement('S0/0/3', { value: dp((vs) => vs.text2) }, []),
                adoptElement(
                    'S0/0/4',
                    { checked: dp((vs) => vs.bool1), value: dp((vs) => vs.text2) },
                    [],
                ),
                adoptText('S0/0/6', (vs) => vs.text3),
                adoptElement('S0/0/7', { class: da((vs) => `${vs.bool1 ? 'main' : ''}`) }, [
                    adoptText('S0/0/7', (vs) => vs.text3),
                ]),
                adoptElement('S0/0/8', { class: da((vs) => `${vs.bool1 ? 'main' : 'second'}`) }, [
                    adoptText('S0/0/8', (vs) => vs.text3),
                ]),
                adoptElement(
                    'S0/0/9',
                    {
                        class: da(
                            (vs) =>
                                `first-class ${vs.bool1 ? 'main' : 'second'} ${!vs.bool1 ? 'third' : 'forth'}`,
                        ),
                    },
                    [adoptText('S0/0/9', (vs) => vs.text3)],
                ),
                adoptElement('S0/0/10', { 'data-attribute': da((vs) => vs.text) }, []),
                adoptElement('S0/0/11', { 'data-attribute': da((vs) => `${vs.text}-abcd`) }, []),
                adoptElement('S0/0/12', { 'data-attribute': da((vs) => `abcd-${vs.text}`) }, []),
                adoptElement(
                    'S0/0/13',
                    { 'data-attribute': da((vs) => `abcd-${vs.text}-abcd`) },
                    [],
                ),
                adoptElement('S0/0/14', { disabled: ba((vs) => vs.bool1) }, []),
                adoptElement('S0/0/15', { disabled: ba((vs) => !vs.bool1) }, []),
            ]),
        ) as AttributesElement;
    return [refManager.getPublicAPI() as AttributesElementRefs, render];
}
