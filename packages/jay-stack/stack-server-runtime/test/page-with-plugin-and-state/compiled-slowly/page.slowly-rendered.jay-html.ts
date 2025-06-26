import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions, JayContract,
} from 'jay-runtime';
import {
    SimplePluginRefs,
    SimplePluginViewState,
} from '../../simple-plugin/compiled/simple-plugin.jay-contract';

export interface PageViewState {
    plugin: SimplePluginViewState;
    pageSlowlyRendered: string;
    pageFastDynamicRendered: string;
}

export interface PageElementRefs {
    plugin: SimplePluginRefs;
    button: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];
export type PageContract = JayContract<PageViewState, PageElementRefs>

export function render(options?: RenderElementOptions): PageElementPreRender {
    const [pluginRefManager, [refPluginButton]] = ReferencesManager.for(
        options,
        ['pluginButton'],
        [],
        [],
        [],
    );
    const [refManager, [refButton]] = ReferencesManager.for(options, ['button'], [], [], [], {
        plugin: pluginRefManager,
    });

    const render = (viewState: PageViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                // Plugin values section
                e('h2', {}, ['Plugin Values']),
                e('div', {}, ['Plugin Slow: SLOWLY RENDERED']),
                e('div', {}, [dt((vs) => `Plugin Fast: ${vs.plugin.pluginInteractiveRendered}`)]),
                e('button', { 'data-id': 'plugin-button' }, ['Plugin Button'], refPluginButton()),

                // Page values section
                e('h2', {}, ['Page Values']),
                e('div', {}, ['Page Slow: SLOWLY RENDERED']),
                e('div', {}, [dt((vs) => `Page Fast: ${vs.pageFastDynamicRendered}`)]),
                e('button', { 'data-id': 'page-button' }, ['Page Button'], refButton()),
            ]),
        ) as PageElement;

    return [refManager.getPublicAPI() as PageElementRefs, render];
}
