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
// @ts-ignore
import { CardViewState, CardRefs, CardInteractiveViewState } from './card/card.jay-contract';

export interface PageWithOverrideParentBindingViewState {
    itemName: string;
}

export interface PageWithOverrideParentBindingElementRefs {
    ar0: CardRefs;
}

export type PageWithOverrideParentBindingSlowViewState = {};
export type PageWithOverrideParentBindingFastViewState = PageWithOverrideParentBindingViewState;
export type PageWithOverrideParentBindingInteractiveViewState =
    PageWithOverrideParentBindingViewState;

export type PageWithOverrideParentBindingElement = JayElement<
    PageWithOverrideParentBindingViewState,
    PageWithOverrideParentBindingElementRefs
>;
export type PageWithOverrideParentBindingElementRender = RenderElement<
    PageWithOverrideParentBindingViewState,
    PageWithOverrideParentBindingElementRefs,
    PageWithOverrideParentBindingElement
>;
export type PageWithOverrideParentBindingElementPreRender = [
    PageWithOverrideParentBindingElementRefs,
    PageWithOverrideParentBindingElementRender,
];
export type PageWithOverrideParentBindingContract = JayContract<
    PageWithOverrideParentBindingViewState,
    PageWithOverrideParentBindingElementRefs,
    PageWithOverrideParentBindingSlowViewState,
    PageWithOverrideParentBindingFastViewState,
    PageWithOverrideParentBindingInteractiveViewState
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
    const [refManager, [refCta, refDisclaimer]] = ReferencesManager.for(
        options,
        ['cta', 'disclaimer'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement('S1/0', {}, [
                adoptText('S1/0/0', (vs) => vs.heading),
                adoptElement(
                    'S1/0/1',
                    {},
                    [adoptText('S1/0/1', (vs, _p1) => `Start ${_p1.itemName} trial`)],
                    refCta(),
                ),
                adoptElement('S1/0/2', {}, [], refDisclaimer()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}
const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    'S0/0/card:AR0',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithOverrideParentBindingElementPreRender {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState: PageWithOverrideParentBindingViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.itemName),
                childCompHydrate(
                    _HeadlessCard0,
                    (vs: PageWithOverrideParentBindingViewState) => ({
                        heading: 'Premium',
                        jc: 'card',
                        __parentContext: vs,
                    }),
                    'S1/0',
                    refAr0(),
                ),
            ]),
        ) as PageWithOverrideParentBindingElement;
    return [refManager.getPublicAPI() as PageWithOverrideParentBindingElementRefs, render];
}
