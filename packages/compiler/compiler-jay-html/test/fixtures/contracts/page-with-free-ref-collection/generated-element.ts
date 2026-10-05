import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ComponentCollectionRefImpl,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
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

// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard0ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard0Element
>;
type _HeadlessCard0ElementPreRender = [CardRefs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
    const [refManager, [refCardAction, refDismiss]] = ReferencesManager.for(
        options,
        ['cardAction', 'dismiss'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'region', style: { cssText: 'display: contents' } }, [
                e('div', { class: 'card' }, [
                    e('h2', {}, [dt((vs) => vs.heading)]),
                    e('button', {}, ['Action'], refCardAction()),
                    e('button', {}, ['Dismiss'], refDismiss()),
                ]),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    card,
    (dataIds) => [...dataIds, 'card:region'].toString(),
    ['dismiss'],
);

export function render(options?: RenderElementOptions): PageWithFreeRefCollectionElementPreRender {
    const [cardsRefManager, [refRegion]] = ReferencesManager.for(options, [], [], [], ['region']);
    const [refRegionFreeRefManager] = ReferencesManager.for(options, [], ['dismiss'], [], []);
    (cardsRefManager.get('region') as ComponentCollectionRefImpl<any, any>).setFreeRefManager(
        refRegionFreeRefManager,
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        cards: cardsRefManager,
    });
    const render = (viewState: PageWithFreeRefCollectionViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                forEach(
                    (vs: PageWithFreeRefCollectionViewState) => vs.cards,
                    (vs1: CardOfPageWithFreeRefCollectionViewState) => {
                        return e('div', { class: 'cards' }, [
                            childComp(
                                _HeadlessCard0,
                                (vs1: CardOfPageWithFreeRefCollectionViewState) => ({
                                    heading: vs1.title,
                                }),
                                refRegion(),
                                refRegionFreeRefManager,
                            ),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as PageWithFreeRefCollectionElement;
    return [refManager.getPublicAPI() as PageWithFreeRefCollectionElementRefs, render];
}
