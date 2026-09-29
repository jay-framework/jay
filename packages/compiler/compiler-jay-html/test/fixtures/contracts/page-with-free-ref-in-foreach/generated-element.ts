import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ComponentRefsImpl,
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
    TagOfCardViewState,
    CardInteractiveViewState,
} from './card/card.jay-contract';
import { card } from './card/card';

export interface PageWithFreeRefInForeachViewState {
    pageTitle: string;
}

export interface PageWithFreeRefInForeachElementRefs {
    region: CardRefs & {
        dismiss: HTMLElementCollectionProxy<TagOfCardViewState, HTMLButtonElement>;
    };
}

export type PageWithFreeRefInForeachSlowViewState = {};
export type PageWithFreeRefInForeachFastViewState = PageWithFreeRefInForeachViewState;
export type PageWithFreeRefInForeachInteractiveViewState = PageWithFreeRefInForeachViewState;

export type PageWithFreeRefInForeachElement = JayElement<
    PageWithFreeRefInForeachViewState,
    PageWithFreeRefInForeachElementRefs
>;
export type PageWithFreeRefInForeachElementRender = RenderElement<
    PageWithFreeRefInForeachViewState,
    PageWithFreeRefInForeachElementRefs,
    PageWithFreeRefInForeachElement
>;
export type PageWithFreeRefInForeachElementPreRender = [
    PageWithFreeRefInForeachElementRefs,
    PageWithFreeRefInForeachElementRender,
];
export type PageWithFreeRefInForeachContract = JayContract<
    PageWithFreeRefInForeachViewState,
    PageWithFreeRefInForeachElementRefs,
    PageWithFreeRefInForeachSlowViewState,
    PageWithFreeRefInForeachFastViewState,
    PageWithFreeRefInForeachInteractiveViewState
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
    const [refManager, [refDismiss]] = ReferencesManager.for(options, [], ['dismiss'], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                de('ul', {}, [
                    forEach(
                        (vs: CardViewState) => vs.tags,
                        (vs1: TagOfCardViewState) => {
                            return e('li', {}, [
                                e('span', {}, [dt((vs1) => vs1.label)]),
                                e('button', {}, ['x'], refDismiss()),
                            ]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    card,
    'S0/0/card:region',
    ['dismiss'],
);

export function render(options?: RenderElementOptions): PageWithFreeRefInForeachElementPreRender {
    const [refManager, [refRegion]] = ReferencesManager.for(options, [], [], ['region'], []);
    const [refRegionFreeRefManager] = ReferencesManager.for(options, [], ['dismiss'], [], []);
    (refManager.get('region') as ComponentRefsImpl<any, any>).setFreeRefManager(
        refRegionFreeRefManager,
    );
    const render = (viewState: PageWithFreeRefInForeachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                childComp(
                    _HeadlessCard0,
                    (vs: PageWithFreeRefInForeachViewState) => ({ heading: 'Card Heading' }),
                    refRegion(),
                    refRegionFreeRefManager,
                ),
            ]),
        ) as PageWithFreeRefInForeachElement;
    return [refManager.getPublicAPI() as PageWithFreeRefInForeachElementRefs, render];
}
