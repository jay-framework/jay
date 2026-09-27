import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
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
            adoptElement('S1/0', {}, [
                adoptText('S1/0/0', (vs) => vs.heading),
                adoptElement('S1/0/1', {}, [], refCardAction()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    card,
    'S0/0/card:plainCard',
);

// Hydrate inline template for headless component: card #1
type _HeadlessCard1Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard1ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard1Element
>;
type _HeadlessCard1ElementPreRender = [CardRefs, _HeadlessCard1ElementRender];

function _headlessCard1HydrateRender(
    options?: RenderElementOptions,
): _HeadlessCard1ElementPreRender {
    const [refManager, [refCardAction2]] = ReferencesManager.for(
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
                adoptElement('S2/0/1', {}, [], refCardAction2()),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard1 = makeHeadlessInstanceComponent(
    _headlessCard1HydrateRender,
    card,
    'S0/0/card:richCard',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithCodedRegionElementPreRender {
    const [refManager, [refPlainCard, refRichCard]] = ReferencesManager.for(
        options,
        [],
        [],
        ['plainCard', 'richCard'],
        [],
    );
    const render = (viewState: PageWithCodedRegionViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessCard0,
                    (vs: PageWithCodedRegionViewState) => ({ heading: 'Plain' }),
                    'S1/0',
                    refPlainCard(),
                ),
                childCompHydrate(
                    _HeadlessCard1,
                    (vs: PageWithCodedRegionViewState) => ({ heading: 'Rich' }),
                    'S2/0',
                    refRichCard(),
                ),
            ]),
        ) as PageWithCodedRegionElement;
    return [refManager.getPublicAPI() as PageWithCodedRegionElementRefs, render];
}
