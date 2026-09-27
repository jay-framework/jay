import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    CardViewState,
    CardRefs,
    CardInteractiveViewState,
    CardRepeatedRefs,
} from './card/card.jay-contract';
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
        richCards: CardRepeatedRefs;
    };
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

const _HeadlessCard0 = makeHeadlessInstanceComponent(_headlessCard0Render, card, (dataIds) =>
    [...dataIds, 'card:richCards'].toString(),
);

export function render(options?: RenderElementOptions): PageWithTier3SlotForeachElementPreRender {
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
    const render = (viewState: PageWithTier3SlotForeachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                forEach(
                    (vs: PageWithTier3SlotForeachViewState) => vs.cards,
                    (vs1: CardOfPageWithTier3SlotForeachViewState) => {
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _HeadlessCard0,
                                (vs1: CardOfPageWithTier3SlotForeachViewState) => ({
                                    heading: vs1.title,
                                }),
                                refRichCards(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as PageWithTier3SlotForeachElement;
    return [refManager.getPublicAPI() as PageWithTier3SlotForeachElementRefs, render];
}
