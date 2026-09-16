import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface PageWithOverrideUnwrapParentBindingViewState {
    itemName: string;
}

export interface PageWithOverrideUnwrapParentBindingElementRefs {
    cta: HTMLElementProxy<PageWithOverrideUnwrapParentBindingViewState, HTMLButtonElement>;
}

export type PageWithOverrideUnwrapParentBindingSlowViewState = {};
export type PageWithOverrideUnwrapParentBindingFastViewState =
    PageWithOverrideUnwrapParentBindingViewState;
export type PageWithOverrideUnwrapParentBindingInteractiveViewState =
    PageWithOverrideUnwrapParentBindingViewState;

export type PageWithOverrideUnwrapParentBindingElement = JayElement<
    PageWithOverrideUnwrapParentBindingViewState,
    PageWithOverrideUnwrapParentBindingElementRefs
>;
export type PageWithOverrideUnwrapParentBindingElementRender = RenderElement<
    PageWithOverrideUnwrapParentBindingViewState,
    PageWithOverrideUnwrapParentBindingElementRefs,
    PageWithOverrideUnwrapParentBindingElement
>;
export type PageWithOverrideUnwrapParentBindingElementPreRender = [
    PageWithOverrideUnwrapParentBindingElementRefs,
    PageWithOverrideUnwrapParentBindingElementRender,
];
export type PageWithOverrideUnwrapParentBindingContract = JayContract<
    PageWithOverrideUnwrapParentBindingViewState,
    PageWithOverrideUnwrapParentBindingElementRefs,
    PageWithOverrideUnwrapParentBindingSlowViewState,
    PageWithOverrideUnwrapParentBindingFastViewState,
    PageWithOverrideUnwrapParentBindingInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithOverrideUnwrapParentBindingElementPreRender {
    const [refManager, [refCta]] = ReferencesManager.for(options, ['cta'], [], [], []);
    const render = (viewState: PageWithOverrideUnwrapParentBindingViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.itemName),
                adoptElement(
                    'S0/0/1/1',
                    {},
                    [adoptText('S0/0/1/1', (vs) => `Start ${vs.itemName} trial`)],
                    refCta(),
                ),
            ]),
        ) as PageWithOverrideUnwrapParentBindingElement;
    return [refManager.getPublicAPI() as PageWithOverrideUnwrapParentBindingElementRefs, render];
}
