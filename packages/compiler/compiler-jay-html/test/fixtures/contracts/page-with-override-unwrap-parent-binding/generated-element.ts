import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
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

export function render(
    options?: RenderElementOptions,
): PageWithOverrideUnwrapParentBindingElementPreRender {
    const [refManager, [refCta]] = ReferencesManager.for(options, ['cta'], [], [], []);
    const render = (viewState: PageWithOverrideUnwrapParentBindingViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.itemName)]),
                e('div', { class: 'card' }, [
                    e('h2', {}, ['Premium']),
                    e('button', {}, [dt((vs) => `Start ${vs.itemName} trial`)], refCta()),
                ]),
            ]),
        ) as PageWithOverrideUnwrapParentBindingElement;
    return [refManager.getPublicAPI() as PageWithOverrideUnwrapParentBindingElementRefs, render];
}
