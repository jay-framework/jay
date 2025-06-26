import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface StylesWithUrlsViewState {
    text1: string;
    text2: string;
}

export interface StylesWithUrlsElementRefs {}

export type StylesWithUrlsElement = JayElement<StylesWithUrlsViewState, StylesWithUrlsElementRefs>;
export type StylesWithUrlsElementRender = RenderElement<
    StylesWithUrlsViewState,
    StylesWithUrlsElementRefs,
    StylesWithUrlsElement
>;
export type StylesWithUrlsElementPreRender = [
    StylesWithUrlsElementRefs,
    StylesWithUrlsElementRender,
];
export type StylesWithUrlsContract = JayContract<StylesWithUrlsViewState, StylesWithUrlsElementRefs>;

export function render(options?: RenderElementOptions): StylesWithUrlsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: StylesWithUrlsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e(
                    'div',
                    {
                        style: {
                            cssText:
                                "background: url('http://localhost:5173/src/components/portal/sites/build_ui/images/18017:3629_FILL.png'); color: red",
                        },
                    },
                    [dt((vs) => vs.text1)],
                ),
                e(
                    'div',
                    {
                        style: {
                            cssText:
                                "background: url('https://example.com/image.png'); color: green",
                        },
                    },
                    [dt((vs) => vs.text2)],
                ),
            ]),
        ) as StylesWithUrlsElement;
    return [refManager.getPublicAPI() as StylesWithUrlsElementRefs, render];
}
