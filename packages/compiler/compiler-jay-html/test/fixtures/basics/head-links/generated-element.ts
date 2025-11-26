import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    injectHeadLinks,
} from '@jay-framework/runtime';

import './head-links.css';

export interface HeadLinksViewState {
    title: string;
}

export interface HeadLinksElementRefs {}

export type HeadLinksSlowViewState = {};
export type HeadLinksFastViewState = {};
export type HeadLinksInteractiveViewState = HeadLinksViewState;

export type HeadLinksElement = JayElement<HeadLinksViewState, HeadLinksElementRefs>;
export type HeadLinksElementRender = RenderElement<
    HeadLinksViewState,
    HeadLinksElementRefs,
    HeadLinksElement
>;
export type HeadLinksElementPreRender = [HeadLinksElementRefs, HeadLinksElementRender];
export type HeadLinksContract = JayContract<
    HeadLinksViewState,
    HeadLinksElementRefs,
    HeadLinksSlowViewState,
    HeadLinksFastViewState,
    HeadLinksInteractiveViewState
>;

export function render(options?: RenderElementOptions): HeadLinksElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    injectHeadLinks([
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', attributes: { crossorigin: '' } },
        { rel: 'icon', href: '/favicon.ico', attributes: { type: 'image/x-icon' } },
        { rel: 'canonical', href: 'https://example.com/current-page' },
        { rel: 'manifest', href: '/manifest.json' },
    ]);
    const render = (viewState: HeadLinksViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('p', {}, ['This tests head links injection']),
            ]),
        ) as HeadLinksElement;
    return [refManager.getPublicAPI() as HeadLinksElementRefs, render];
}
