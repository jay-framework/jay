import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ComponentRefsImpl,
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
    const [refManager, [refDismiss]] = ReferencesManager.for(options, [], ['dismiss'], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S1/0', {}, [
                adoptText('S1/0/0/0', (vs) => vs.heading),
                adoptDynamicElement('S1/0/0/1', {}, [
                    hydrateForEach(
                        (vs: CardViewState) => vs.tags,
                        'id',
                        'S1/0/0/1/0',
                        (vs1: TagOfCardViewState) => [
                            adoptText('S2/0', (vs1) => vs1.label),
                            adoptElement('S2/1', {}, [], refDismiss()),
                        ],
                        (vs1: TagOfCardViewState) => {
                            return e('li', {}, [
                                e('span', {}, [dt((vs1) => vs1.label)]),
                                e('button', {}, ['x'], refDismiss()),
                            ]);
                        },
                    ),
                ]),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    card,
    'S0/0/card:region',
    ['dismiss'],
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithFreeRefInForeachElementPreRender {
    const [refManager, [refRegion]] = ReferencesManager.for(options, [], [], ['region'], []);
    const [refRegionFreeRefManager] = ReferencesManager.for(options, [], ['dismiss'], [], []);
    (refManager.get('region') as ComponentRefsImpl<any, any>).setFreeRefManager(
        refRegionFreeRefManager,
    );
    const render = (viewState: PageWithFreeRefInForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessCard0,
                    (vs: PageWithFreeRefInForeachViewState) => ({ heading: 'Card Heading' }),
                    'S1/0',
                    refRegion(),
                    refRegionFreeRefManager,
                ),
            ]),
        ) as PageWithFreeRefInForeachElement;
    return [refManager.getPublicAPI() as PageWithFreeRefInForeachElementRefs, render];
}
