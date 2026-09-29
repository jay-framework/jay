import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ComponentRefsImpl,
    ConstructContext,
    HTMLElementProxy,
    childComp,
    RenderElementOptions,
    JayContract,
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
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                e('button', {}, ['Action'], refCardAction()),
                e('button', {}, ['Dismiss'], refDismiss()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    card,
    'S0/0/card:plainCard',
    ['dismiss'],
);

export function render(options?: RenderElementOptions): PageWithFreeRefElementPreRender {
    const [refManager, [refPlainCard]] = ReferencesManager.for(options, [], [], ['plainCard'], []);
    const [refPlainCardFreeRefManager] = ReferencesManager.for(options, ['dismiss'], [], [], []);
    (refManager.get('plainCard') as ComponentRefsImpl<any, any>).setFreeRefManager(
        refPlainCardFreeRefManager,
    );
    const render = (viewState: PageWithFreeRefViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                childComp(
                    _HeadlessCard0,
                    (vs: PageWithFreeRefViewState) => ({ heading: 'Plain' }),
                    refPlainCard(),
                    refPlainCardFreeRefManager,
                ),
            ]),
        ) as PageWithFreeRefElement;
    return [refManager.getPublicAPI() as PageWithFreeRefElementRefs, render];
}
