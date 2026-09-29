import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ComponentCollectionRefImpl,
    ConstructContext,
    HTMLElementCollectionProxy,
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

export interface CardOfPageWithFreeRefCollectionViewState {
    id: string;
    title: string;
}

export interface PageWithFreeRefCollectionViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithFreeRefCollectionViewState>;
}

export interface PageWithFreeRefCollectionElementRefs {
    cards: {
        region: CardRepeatedRefs & {
            dismiss: HTMLElementCollectionProxy<CardViewState, HTMLButtonElement>;
        };
    };
}

export type PageWithFreeRefCollectionSlowViewState = {};
export type PageWithFreeRefCollectionFastViewState = PageWithFreeRefCollectionViewState;
export type PageWithFreeRefCollectionInteractiveViewState = PageWithFreeRefCollectionViewState;

export type PageWithFreeRefCollectionElement = JayElement<
    PageWithFreeRefCollectionViewState,
    PageWithFreeRefCollectionElementRefs
>;
export type PageWithFreeRefCollectionElementRender = RenderElement<
    PageWithFreeRefCollectionViewState,
    PageWithFreeRefCollectionElementRefs,
    PageWithFreeRefCollectionElement
>;
export type PageWithFreeRefCollectionElementPreRender = [
    PageWithFreeRefCollectionElementRefs,
    PageWithFreeRefCollectionElementRender,
];
export type PageWithFreeRefCollectionContract = JayContract<
    PageWithFreeRefCollectionViewState,
    PageWithFreeRefCollectionElementRefs,
    PageWithFreeRefCollectionSlowViewState,
    PageWithFreeRefCollectionFastViewState,
    PageWithFreeRefCollectionInteractiveViewState
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
    const [refManager, [refCardAction, refDismiss]] = ReferencesManager.for(
        options,
        ['cardAction', 'dismiss'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S2/0', {}, [
                adoptText('S2/0/0', (vs) => vs.heading),
                adoptElement('S2/0/1', {}, [], refCardAction()),
                adoptElement('S2/0/2', {}, [], refDismiss()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0Adopt = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    card,
    (dataIds) => [...dataIds, 'card:region'].toString(),
    ['dismiss'],
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
    const [refManager, [refCardAction, refDismiss]] = ReferencesManager.for(
        options,
        ['cardAction', 'dismiss'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                e('button', {}, ['Action'], refCardAction()),
                e('button', {}, ['Dismiss'], refDismiss()),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1Render,
    card,
    (dataIds) => [...dataIds, 'card:region'].toString(),
    ['dismiss'],
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithFreeRefCollectionElementPreRender {
    const [cardsRefManager, [refRegion]] = ReferencesManager.for(options, [], [], [], ['region']);
    const [refRegionFreeRefManager] = ReferencesManager.for(options, [], ['dismiss'], [], []);
    (cardsRefManager.get('region') as ComponentCollectionRefImpl<any, any>).setFreeRefManager(
        refRegionFreeRefManager,
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithFreeRefCollectionViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                hydrateForEach(
                    (vs: PageWithFreeRefCollectionViewState) => vs.cards,
                    'id',
                    'S0/0/1',
                    (vs1: CardOfPageWithFreeRefCollectionViewState) => [
                        childCompHydrate(
                            _HeadlessCard0Adopt,
                            (vs1: CardOfPageWithFreeRefCollectionViewState) => ({
                                heading: vs1.title,
                            }),
                            'S2/0',
                            refRegion(),
                            refRegionFreeRefManager,
                        ),
                    ],
                    (vs1: CardOfPageWithFreeRefCollectionViewState) => {
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _HeadlessCard1,
                                (vs1: CardOfPageWithFreeRefCollectionViewState) => ({
                                    heading: vs1.title,
                                }),
                                refRegion(),
                                refRegionFreeRefManager,
                            ),
                        ]);
                    },
                ),
            ]),
        ) as PageWithFreeRefCollectionElement;
    return [refManager.getPublicAPI() as PageWithFreeRefCollectionElementRefs, render];
}
