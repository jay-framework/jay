import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ComponentRefsImpl,
    ConstructContext,
    HTMLElementProxy,
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

export interface PageWithFreeRefViewState {
    pageTitle: string;
}

export interface PageWithFreeRefElementRefs {
    plainCard: CardRefs & { dismiss: HTMLElementProxy<CardViewState, HTMLButtonElement> };
}

export type PageWithFreeRefSlowViewState = {};
export type PageWithFreeRefFastViewState = PageWithFreeRefViewState;
export type PageWithFreeRefInteractiveViewState = PageWithFreeRefViewState;

export type PageWithFreeRefElement = JayElement<
    PageWithFreeRefViewState,
    PageWithFreeRefElementRefs
>;
export type PageWithFreeRefElementRender = RenderElement<
    PageWithFreeRefViewState,
    PageWithFreeRefElementRefs,
    PageWithFreeRefElement
>;
export type PageWithFreeRefElementPreRender = [
    PageWithFreeRefElementRefs,
    PageWithFreeRefElementRender,
];
export type PageWithFreeRefContract = JayContract<
    PageWithFreeRefViewState,
    PageWithFreeRefElementRefs,
    PageWithFreeRefSlowViewState,
    PageWithFreeRefFastViewState,
    PageWithFreeRefInteractiveViewState
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
            adoptElement('S1/0', {}, [
                adoptText('S1/0/0/0', (vs) => vs.heading),
                adoptElement('S1/0/0/1', {}, [], refCardAction()),
                adoptElement('S1/0/0/2', {}, [], refDismiss()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    card,
    'S0/0/card:plainCard',
    ['dismiss'],
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithFreeRefElementPreRender {
    const [refManager, [refPlainCard]] = ReferencesManager.for(options, [], [], ['plainCard'], []);
    const [refPlainCardFreeRefManager] = ReferencesManager.for(options, ['dismiss'], [], [], []);
    (refManager.get('plainCard') as ComponentRefsImpl<any, any>).setFreeRefManager(
        refPlainCardFreeRefManager,
    );
    const render = (viewState: PageWithFreeRefViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessCard0,
                    (vs: PageWithFreeRefViewState) => ({ heading: 'Plain' }),
                    'S1/0',
                    refPlainCard(),
                    refPlainCardFreeRefManager,
                ),
            ]),
        ) as PageWithFreeRefElement;
    return [refManager.getPublicAPI() as PageWithFreeRefElementRefs, render];
}
