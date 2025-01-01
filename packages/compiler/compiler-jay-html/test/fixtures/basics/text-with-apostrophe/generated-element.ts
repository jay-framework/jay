import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';

export interface TextWithApostropheViewState {
    s1: string;
}

export interface TextWithApostropheElementRefs {}

export type TextWithApostropheElement = JayElement<
    TextWithApostropheViewState,
    TextWithApostropheElementRefs
>;
export type TextWithApostropheElementRender = RenderElement<
    TextWithApostropheViewState,
    TextWithApostropheElementRefs,
    TextWithApostropheElement
>;
export type TextWithApostropheElementPreRender = [
    TextWithApostropheElementRefs,
    TextWithApostropheElementRender,
];

export function render(options?: RenderElementOptions): TextWithApostropheElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: TextWithApostropheViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, ["static text's"]),
        ) as TextWithApostropheElement;
    return [refManager.getPublicAPI() as TextWithApostropheElementRefs, render];
}
