import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import { CardViewState, CardRefs, CardInteractiveViewState } from './card/card.jay-contract';
import { card } from './card/card';

export interface PageWithCodedRegionViewState {
    pageTitle: string;
}

export interface PageWithCodedRegionElementRefs {
    plainCard: CardRefs;
    richCard: CardRefs;
}

export type PageWithCodedRegionSlowViewState = {};
export type PageWithCodedRegionFastViewState = PageWithCodedRegionViewState;
export type PageWithCodedRegionInteractiveViewState = PageWithCodedRegionViewState;

export type PageWithCodedRegionElement = JayElement<
    PageWithCodedRegionViewState,
    PageWithCodedRegionElementRefs
>;
export type PageWithCodedRegionElementRender = RenderElement<
    PageWithCodedRegionViewState,
    PageWithCodedRegionElementRefs,
    PageWithCodedRegionElement
>;
export type PageWithCodedRegionElementPreRender = [
    PageWithCodedRegionElementRefs,
    PageWithCodedRegionElementRender,
];
export type PageWithCodedRegionContract = JayContract<
    PageWithCodedRegionViewState,
    PageWithCodedRegionElementRefs,
    PageWithCodedRegionSlowViewState,
    PageWithCodedRegionFastViewState,
    PageWithCodedRegionInteractiveViewState
>;

// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard0ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard0Element
>;
type _HeadlessCard0ElementPreRender = [CardRefs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
    const [refManager, [refCardAction]] = ReferencesManager.for(
        options,
        ['cardAction'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                e('button', {}, ['Action'], refCardAction()),
                e('div', {}, ['Default body']),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    card,
    'S0/0/card:plainCard',
);

// Inline template for headless component: card #1
type _HeadlessCard1Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard1ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard1Element
>;
type _HeadlessCard1ElementPreRender = [CardRefs, _HeadlessCard1ElementRender];

function _headlessCard1Render(options?: RenderElementOptions): _HeadlessCard1ElementPreRender {
    const [refManager, [refCardAction]] = ReferencesManager.for(
        options,
        ['cardAction'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                e('button', {}, ['Action'], refCardAction()),
                e('div', {}, ['Default body']),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1Render,
    card,
    'S0/0/card:richCard',
);

export function render(options?: RenderElementOptions): PageWithCodedRegionElementPreRender {
    const [refManager, [refPlainCard, refRichCard]] = ReferencesManager.for(
        options,
        [],
        [],
        ['plainCard', 'richCard'],
        [],
    );
    const render = (viewState: PageWithCodedRegionViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                childComp(
                    _HeadlessCard0,
                    (vs: PageWithCodedRegionViewState) => ({ heading: 'Plain' }),
                    refPlainCard(),
                ),
                childComp(
                    _HeadlessCard1,
                    (vs: PageWithCodedRegionViewState) => ({ heading: 'Rich' }),
                    refRichCard(),
                ),
            ]),
        ) as PageWithCodedRegionElement;
    return [refManager.getPublicAPI() as PageWithCodedRegionElementRefs, render];
}
