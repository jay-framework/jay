import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
} from 'jay-runtime';

export interface PageViewState {
    slowlyRendered: string;
    fastDynamicRendered: string;
}

export interface PageElementRefs {
    button: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export function render(options?: RenderElementOptions): PageElementPreRender {
    const [refManager, [refButton]] = ReferencesManager.for(options, ['button'], [], [], []);
    const render = (viewState: PageViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, ['static text A']),
                e('div', {}, [dt((vs) => vs.fastDynamicRendered)]),
                e('button', { 'data-id': 'button' }, ['click'], refButton()),
            ]),
        ) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}
