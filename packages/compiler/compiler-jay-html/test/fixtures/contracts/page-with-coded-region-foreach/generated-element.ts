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

export function render(options?: RenderElementOptions): PageWithCodedRegionForeachElementPreRender {
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
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                forEach(
                    (vs: PageWithCodedRegionForeachViewState) => vs.cards,
                    (vs1: CardOfPageWithCodedRegionForeachViewState) => {
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _HeadlessCard0,
                                (vs1: CardOfPageWithCodedRegionForeachViewState) => ({
                                    heading: vs1.title,
                                }),
                                refRichCards(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as PageWithCodedRegionForeachElement;
    return [refManager.getPublicAPI() as PageWithCodedRegionForeachElementRefs, render];
}
