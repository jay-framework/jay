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
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    CardViewState,
    CardRefs,
    CardInteractiveViewState,
    CardRepeatedRefs,
} from './card/card.jay-contract';
import { card } from './card/card';

export interface CardOfPageWithCodedRegionForeachViewState {
    id: string;
    title: string;
}

export interface PageWithCodedRegionForeachViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithCodedRegionForeachViewState>;
}

export interface PageWithCodedRegionForeachElementRefs {
    cards: {
        richCards: CardRepeatedRefs;
    };
}

export type PageWithCodedRegionForeachSlowViewState = {};
export type PageWithCodedRegionForeachFastViewState = PageWithCodedRegionForeachViewState;
export type PageWithCodedRegionForeachInteractiveViewState = PageWithCodedRegionForeachViewState;

export type PageWithCodedRegionForeachElement = JayElement<
    PageWithCodedRegionForeachViewState,
    PageWithCodedRegionForeachElementRefs
>;
export type PageWithCodedRegionForeachElementRender = RenderElement<
    PageWithCodedRegionForeachViewState,
    PageWithCodedRegionForeachElementRefs,
    PageWithCodedRegionForeachElement
>;
export type PageWithCodedRegionForeachElementPreRender = [
    PageWithCodedRegionForeachElementRefs,
    PageWithCodedRegionForeachElementRender,
];
export type PageWithCodedRegionForeachContract = JayContract<
    PageWithCodedRegionForeachViewState,
    PageWithCodedRegionForeachElementRefs,
    PageWithCodedRegionForeachSlowViewState,
    PageWithCodedRegionForeachFastViewState,
    PageWithCodedRegionForeachInteractiveViewState
>;

// Hydrate inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard0ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard0Element
>;
type _HeadlessCard0ElementPreRender = [CardRefs, _HeadlessCard0ElementRender];

function _headlessCard0HydrateRender(
    options?: RenderElementOptions,
): _HeadlessCard0ElementPreRender {
    const [refManager, [refCardAction]] = ReferencesManager.for(
        options,
        ['cardAction'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S2/0', {}, [
                adoptText('S2/0/0/0', (vs) => vs.heading),
                adoptElement('S2/0/0/1', {}, [], refCardAction()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0Adopt = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    card,
    (dataIds) => [...dataIds, 'card:richCards'].toString(),
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
            e('div', { class: 'richCards', style: { cssText: 'display: contents' } }, [
                e('div', { class: 'card' }, [
                    e('h2', {}, [dt((vs) => vs.heading)]),
                    e('button', {}, ['Action'], refCardAction()),
                    e('div', {}, ['Default body']),
                ]),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(_headlessCard1Render, card, (dataIds) =>
    [...dataIds, 'card:richCards'].toString(),
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithCodedRegionForeachElementPreRender {
    const [cardsRefManager, [refRichCards]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['richCards'],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithCodedRegionForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                hydrateForEach(
                    (vs: PageWithCodedRegionForeachViewState) => vs.cards,
                    'id',
                    'S0/0/1',
                    (vs1: CardOfPageWithCodedRegionForeachViewState) => [
                        childCompHydrate(
                            _HeadlessCard0Adopt,
                            (vs1: CardOfPageWithCodedRegionForeachViewState) => ({
                                heading: vs1.title,
                            }),
                            'S2/0',
                            refRichCards(),
                        ),
                    ],
                    (vs1: CardOfPageWithCodedRegionForeachViewState) => {
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _HeadlessCard1,
                                (vs1: CardOfPageWithCodedRegionForeachViewState) => ({
                                    heading: vs1.title,
                                }),
                                refRichCards(),
                            ),
                        ]);
                    },
                ),
            ]),
        ) as PageWithCodedRegionForeachElement;
    return [refManager.getPublicAPI() as PageWithCodedRegionForeachElementRefs, render];
}
