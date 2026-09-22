import {
    BaseJayElement,
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementCollectionProxy,
    childComp,
    foreignChild,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import { CardViewState, CardRefs, CardInteractiveViewState } from './card/card.jay-contract';
import { card } from './card/card';

export interface CardOfPageWithTier3SlotForeachViewState {
    id: string;
    title: string;
}

export interface PageWithTier3SlotForeachViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithTier3SlotForeachViewState>;
}

export interface PageWithTier3SlotForeachElementRefs {
    cards: {
        richCards: _HeadlessCard0Refs;
    };
}

interface _HeadlessCard0Refs extends CardRefs {
    body: {
        cta: HTMLElementCollectionProxy<CardOfPageWithTier3SlotForeachViewState, HTMLButtonElement>;
    };
}
interface _HeadlessCard0Slots {
    [slot: string]: BaseJayElement<CardOfPageWithTier3SlotForeachViewState>;
    body: BaseJayElement<CardOfPageWithTier3SlotForeachViewState>;
}

interface _HeadlessCard1Refs extends CardRefs {
    body: {
        cta: HTMLElementCollectionProxy<CardOfPageWithTier3SlotForeachViewState, HTMLButtonElement>;
    };
}
interface _HeadlessCard1Slots {
    [slot: string]: BaseJayElement<CardOfPageWithTier3SlotForeachViewState>;
    body: BaseJayElement<CardOfPageWithTier3SlotForeachViewState>;
}

export type PageWithTier3SlotForeachSlowViewState = {};
export type PageWithTier3SlotForeachFastViewState = PageWithTier3SlotForeachViewState;
export type PageWithTier3SlotForeachInteractiveViewState = PageWithTier3SlotForeachViewState;

export type PageWithTier3SlotForeachElement = JayElement<
    PageWithTier3SlotForeachViewState,
    PageWithTier3SlotForeachElementRefs
>;
export type PageWithTier3SlotForeachElementRender = RenderElement<
    PageWithTier3SlotForeachViewState,
    PageWithTier3SlotForeachElementRefs,
    PageWithTier3SlotForeachElement
>;
export type PageWithTier3SlotForeachElementPreRender = [
    PageWithTier3SlotForeachElementRefs,
    PageWithTier3SlotForeachElementRender,
];
export type PageWithTier3SlotForeachContract = JayContract<
    PageWithTier3SlotForeachViewState,
    PageWithTier3SlotForeachElementRefs,
    PageWithTier3SlotForeachSlowViewState,
    PageWithTier3SlotForeachFastViewState,
    PageWithTier3SlotForeachInteractiveViewState
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
    options: RenderElementOptions | undefined,
    slots: _HeadlessCard0Slots,
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
                adoptText('S2/0/0', (vs) => vs.heading),
                adoptElement('S2/0/1', {}, [], refCardAction()),
                foreignChild(slots.body),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _makeHeadlessCard0 = (slots: _HeadlessCard0Slots) =>
    makeHeadlessInstanceComponent(
        (options?: RenderElementOptions) => _headlessCard0HydrateRender(options, slots),
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

function _headlessCard1Render(
    options: RenderElementOptions | undefined,
    slots: _HeadlessCard1Slots,
): _HeadlessCard1ElementPreRender {
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
                foreignChild(slots.body),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _makeHeadlessCard1 = (slots: _HeadlessCard1Slots) =>
    makeHeadlessInstanceComponent(
        (options?: RenderElementOptions) => _headlessCard1Render(options, slots),
        card,
        (dataIds) => [...dataIds, 'card:richCards'].toString(),
    );

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithTier3SlotForeachElementPreRender {
    const [bodyRefManager, [refCta]] = ReferencesManager.for(options, [], ['cta'], [], []);
    const [richCardsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        body: bodyRefManager,
    });
    const [cardsRefManager, [refRichCards]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['richCards'],
        {
            richCards: richCardsRefManager,
        },
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithTier3SlotForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                hydrateForEach(
                    (vs: PageWithTier3SlotForeachViewState) => vs.cards,
                    'id',
                    'S0/0/1',
                    (vs1: CardOfPageWithTier3SlotForeachViewState) => {
                        const richCardsSlots: _HeadlessCard0Slots = {
                            body: adoptElement(
                                'S1/card:richCards/body/0',
                                {},
                                [
                                    adoptText(
                                        'S1/card:richCards/body/0',
                                        (vs1) => `Body for ${vs1.title}`,
                                    ),
                                ],
                                refCta(),
                            ),
                        };
                        return [
                            childCompHydrate(
                                _makeHeadlessCard0(richCardsSlots),
                                (vs1: CardOfPageWithTier3SlotForeachViewState) => ({
                                    heading: vs1.title,
                                    jc: 'card',
                                }),
                                'S2/0',
                                refRichCards(),
                                richCardsSlots,
                            ),
                        ];
                    },
                    (vs1: CardOfPageWithTier3SlotForeachViewState) => {
                        const richCardsSlots: _HeadlessCard1Slots = {
                            body: e('button', {}, [dt((vs1) => `Body for ${vs1.title}`)], refCta()),
                        };
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _makeHeadlessCard1(richCardsSlots),
                                (vs1: CardOfPageWithTier3SlotForeachViewState) => ({
                                    heading: vs1.title,
                                    jc: 'card',
                                }),
                                refRichCards(),
                                undefined,
                                richCardsSlots,
                            ),
                        ]);
                    },
                ),
            ]),
        ) as PageWithTier3SlotForeachElement;
    return [refManager.getPublicAPI() as PageWithTier3SlotForeachElementRefs, render];
}
