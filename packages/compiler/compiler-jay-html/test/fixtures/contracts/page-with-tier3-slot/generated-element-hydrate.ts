import {
    BaseJayElement,
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    childComp,
    foreignChild,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import { CardViewState, CardRefs, CardInteractiveViewState } from './card/card.jay-contract';
import { card } from './card/card';

export interface PageWithTier3SlotViewState {
    pageTitle: string;
}

export interface PageWithTier3SlotElementRefs {
    plainCard: CardRefs;
    richCard: _HeadlessCard1Refs;
}

interface _HeadlessCard1Refs extends CardRefs {
    body: {
        cta: HTMLElementProxy<PageWithTier3SlotViewState, HTMLButtonElement>;
    };
}
interface _HeadlessCard1Slots {
    [slot: string]: BaseJayElement<PageWithTier3SlotViewState>;
    body: BaseJayElement<PageWithTier3SlotViewState>;
}

export type PageWithTier3SlotSlowViewState = {};
export type PageWithTier3SlotFastViewState = PageWithTier3SlotViewState;
export type PageWithTier3SlotInteractiveViewState = PageWithTier3SlotViewState;

export type PageWithTier3SlotElement = JayElement<
    PageWithTier3SlotViewState,
    PageWithTier3SlotElementRefs
>;
export type PageWithTier3SlotElementRender = RenderElement<
    PageWithTier3SlotViewState,
    PageWithTier3SlotElementRefs,
    PageWithTier3SlotElement
>;
export type PageWithTier3SlotElementPreRender = [
    PageWithTier3SlotElementRefs,
    PageWithTier3SlotElementRender,
];
export type PageWithTier3SlotContract = JayContract<
    PageWithTier3SlotViewState,
    PageWithTier3SlotElementRefs,
    PageWithTier3SlotSlowViewState,
    PageWithTier3SlotFastViewState,
    PageWithTier3SlotInteractiveViewState
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
    options: RenderElementOptions | undefined,
    slots: _HeadlessCard1Slots,
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
                foreignChild(slots.body),
            ]),
        ) as _HeadlessCard1Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _makeHeadlessCard1 = (slots: _HeadlessCard1Slots) =>
    makeHeadlessInstanceComponent(
        (options?: RenderElementOptions) => _headlessCard1HydrateRender(options, slots),
        card,
        'S0/0/card:richCard',
    );

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithTier3SlotElementPreRender {
    const [bodyRefManager, [refCta]] = ReferencesManager.for(options, ['cta'], [], [], []);
    const [richCardRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        body: bodyRefManager,
    });
    const [refManager, [refPlainCard, refRichCard]] = ReferencesManager.for(
        options,
        [],
        [],
        ['plainCard', 'richCard'],
        [],
        {
            richCard: richCardRefManager,
        },
    );
    const render = (viewState: PageWithTier3SlotViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () => {
            const richCardSlots: _HeadlessCard1Slots = {
                body: adoptElement(
                    'S0/0/card:richCard/body/0',
                    {},
                    [adoptText('S0/0/card:richCard/body/0', (vs) => vs.pageTitle)],
                    refCta(),
                ),
            };
            return adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessCard0,
                    (vs: PageWithTier3SlotViewState) => ({ heading: 'Plain', jc: 'card' }),
                    'S1/0',
                    refPlainCard(),
                ),
                childCompHydrate(
                    _makeHeadlessCard1(richCardSlots),
                    (vs: PageWithTier3SlotViewState) => ({ heading: 'Rich', jc: 'card' }),
                    'S2/0',
                    refRichCard(),
                    richCardSlots,
                ),
            ]);
        }) as PageWithTier3SlotElement;
    return [refManager.getPublicAPI() as PageWithTier3SlotElementRefs, render];
}
