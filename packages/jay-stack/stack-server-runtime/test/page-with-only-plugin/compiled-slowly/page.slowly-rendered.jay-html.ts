import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import {
    SimplePluginRefs,
    SimplePluginViewState,
} from '../../simple-plugin/compiled/simple-plugin.jay-contract';

export interface PageViewState {
    plugin: SimplePluginViewState;
}

export interface PageElementRefs {
    plugin: SimplePluginRefs;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];
export type PageContract = JayContract<PageViewState, PageElementRefs>;

export function render(options?: RenderElementOptions): PageElementPreRender {
    const [pluginRefManager, [refButton]] = ReferencesManager.for(
        options,
        ['pluginButton'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        plugin: pluginRefManager,
    });
    const render = (viewState: PageViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, ['static text']),
                e('div', {}, [dt((vs) => vs.plugin.pluginInteractiveRendered)]),
                e('button', { 'data-id': 'button' }, ['click'], refButton()),
            ]),
        ) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}
