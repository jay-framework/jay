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

export interface PageWithOverrideParentBindingViewState {
    itemName: string;
}

export interface PageWithOverrideParentBindingElementRefs {
    card: {
        cta: HTMLElementProxy<PageWithOverrideParentBindingViewState, HTMLButtonElement>;
        disclaimer: HTMLElementProxy<PageWithOverrideParentBindingViewState, HTMLParagraphElement>;
    };
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

export function render(
    options?: RenderElementOptions,
): PageWithOverrideParentBindingElementPreRender {
    const [cardRefManager, [refCta, refDisclaimer]] = ReferencesManager.for(
        options,
        ['cta', 'disclaimer'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        card: cardRefManager,
    });
    const render = (viewState: PageWithOverrideParentBindingViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.itemName)]),
                e('div', { class: 'card' }, [
                    e('h2', {}, [dt((vs) => 'Premium')]),
                    e('button', {}, [dt((vs) => `Start ${vs.itemName} trial`)], refCta()),
                    e('p', {}, ['Default disclaimer text'], refDisclaimer()),
                ]),
            ]),
        ) as PageWithOverrideParentBindingElement;
    return [refManager.getPublicAPI() as PageWithOverrideParentBindingElementRefs, render];
}
