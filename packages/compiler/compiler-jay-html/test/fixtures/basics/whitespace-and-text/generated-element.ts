import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface WhitespaceAndTextViewState {
    text: string;
    text2: string;
    text3: string;
}

export interface WhitespaceAndTextElementRefs {}

export type WhitespaceAndTextElement = JayElement<
    WhitespaceAndTextViewState,
    WhitespaceAndTextElementRefs
>;
export type WhitespaceAndTextElementRender = RenderElement<
    WhitespaceAndTextViewState,
    WhitespaceAndTextElementRefs,
    WhitespaceAndTextElement
>;
export type WhitespaceAndTextElementPreRender = [
    WhitespaceAndTextElementRefs,
    WhitespaceAndTextElementRender,
];
export type WhitespaceAndTextContract = JayContract<WhitespaceAndTextViewState, WhitespaceAndTextElementRefs>;

export function render(options?: RenderElementOptions): WhitespaceAndTextElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: WhitespaceAndTextViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [' multi-line text ']),
                e('div', {}, ['some text', e('span', {}, [' ']), 'another text']),
            ]),
        ) as WhitespaceAndTextElement;
    return [refManager.getPublicAPI() as WhitespaceAndTextElementRefs, render];
}
