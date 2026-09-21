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

export interface PageWithOverrideParentBindingViewState {
    itemName: string;
}

export interface PageWithOverrideParentBindingElementRefs {
    ar0: {
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithOverrideParentBindingElementPreRender {
    const [ar0RefManager, [refCta, refDisclaimer]] = ReferencesManager.for(
        options,
        ['cta', 'disclaimer'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        ar0: ar0RefManager,
    });
    const render = (viewState: PageWithOverrideParentBindingViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.itemName),
                adoptElement('S1/0', {}, [
                    adoptText('S1/0/0', (vs) => 'Premium'),
                    adoptElement(
                        'S1/0/1',
                        {},
                        [adoptText('S1/0/1', (vs) => `Start ${vs.itemName} trial`)],
                        refCta(),
                    ),
                    adoptElement('S1/0/2', {}, [], refDisclaimer()),
                ]),
            ]),
        ) as PageWithOverrideParentBindingElement;
    return [refManager.getPublicAPI() as PageWithOverrideParentBindingElementRefs, render];
}
