import { JayElement, element as e, ConstructContext, RenderElementOptions } from 'jay-runtime';

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

export function render(
    viewState: WhitespaceAndTextViewState,
    options?: RenderElementOptions,
): WhitespaceAndTextElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            e('div', {}, [
                e('div', {}, [' multi-line text ']),
                e('div', {}, ['some text', e('span', {}, [' ']), 'another text']),
            ]),
        options,
    );
}
