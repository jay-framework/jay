import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface SimpleStaticTextViewState {
    s1: string;
}

export interface SimpleStaticTextElementRefs {}

export type SimpleStaticTextElement = JayElement<
    SimpleStaticTextViewState,
    SimpleStaticTextElementRefs
>;
export type SimpleStaticTextElementRender = RenderElement<
    SimpleStaticTextViewState,
    SimpleStaticTextElementRefs,
    SimpleStaticTextElement
>;
export type SimpleStaticTextElementPreRender = [
    SimpleStaticTextElementRefs,
    SimpleStaticTextElementRender,
];
export type SimpleStaticTextContract = JayContract<SimpleStaticTextViewState, SimpleStaticTextElementRefs>;

export function render(options?: RenderElementOptions): SimpleStaticTextElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SimpleStaticTextViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, ['static text']),
        ) as SimpleStaticTextElement;
    return [refManager.getPublicAPI() as SimpleStaticTextElementRefs, render];
}
