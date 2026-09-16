import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
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
    // @ts-ignore
} from './card/card.jay-contract?jay-mainSandbox';

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

// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, CardRefs>;
type _HeadlessCard0ElementRender = RenderElement<
    CardInteractiveViewState,
    CardRefs,
    _HeadlessCard0Element
>;
type _HeadlessCard0ElementPreRender = [CardRefs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
    const [refManager, [refCta, refDisclaimer]] = ReferencesManager.for(
        options,
        ['cta', 'disclaimer'],
        [],
        [],
        [],
    );
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'card' }, [
                e('h2', {}, [dt((vs) => vs.heading)]),
                e('button', {}, [dt((vs, _p1) => `Start ${_p1.itemName} trial`)], refCta()),
                e('p', {}, ['Default disclaimer text'], refDisclaimer()),
            ]),
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as CardRefs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    { comp: (_props, _refs) => ({ render: () => _props }) },
    'S0/0/card:AR0',
);

export function render(
    options?: RenderElementOptions,
): PageWithOverrideParentBindingElementPreRender {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState: PageWithOverrideParentBindingViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.itemName)]),
                childComp(
                    _HeadlessCard0,
                    (vs: PageWithOverrideParentBindingViewState) => ({
                        heading: 'Premium',
                        jc: 'card',
                        __parentContext: vs,
                    }),
                    refAr0(),
                ),
            ]),
        ) as PageWithOverrideParentBindingElement;
    return [refManager.getPublicAPI() as PageWithOverrideParentBindingElementRefs, render];
}
