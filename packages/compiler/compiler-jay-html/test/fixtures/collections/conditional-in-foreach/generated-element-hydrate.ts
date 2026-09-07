import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';

export interface ProductOfConditionalInForeachViewState {
    id: string;
    inStock: boolean;
    name: string;
    price: number;
}

export interface ConditionalInForeachViewState {
    pageTitle: string;
    cartCount: number;
    products: Array<ProductOfConditionalInForeachViewState>;
}

export interface ConditionalInForeachElementRefs {}

export type ConditionalInForeachSlowViewState = Pick<ConditionalInForeachViewState, 'pageTitle'> & {
    products: Array<
        Pick<ConditionalInForeachViewState['products'][number], 'id' | 'inStock' | 'name'>
    >;
};

export type ConditionalInForeachFastViewState = Pick<ConditionalInForeachViewState, 'cartCount'> & {
    products: Array<Pick<ConditionalInForeachViewState['products'][number], 'id' | 'price'>>;
};

export type ConditionalInForeachInteractiveViewState = Pick<
    ConditionalInForeachViewState,
    'cartCount'
> & {
    products: Array<Pick<ConditionalInForeachViewState['products'][number], 'id' | 'price'>>;
};

export type ConditionalInForeachElement = JayElement<
    ConditionalInForeachViewState,
    ConditionalInForeachElementRefs
>;
export type ConditionalInForeachElementRender = RenderElement<
    ConditionalInForeachViewState,
    ConditionalInForeachElementRefs,
    ConditionalInForeachElement
>;
export type ConditionalInForeachElementPreRender = [
    ConditionalInForeachElementRefs,
    ConditionalInForeachElementRender,
];
export type ConditionalInForeachContract = JayContract<
    ConditionalInForeachViewState,
    ConditionalInForeachElementRefs,
    ConditionalInForeachSlowViewState,
    ConditionalInForeachFastViewState,
    ConditionalInForeachInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ConditionalInForeachElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ConditionalInForeachViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptElement('S0/0/0', {}, []),
                adoptText('S0/0/1', (vs) => vs.cartCount),
                hydrateForEach(
                    (vs: ConditionalInForeachViewState) => vs.products,
                    'id',
                    'S0/0/2',
                    (vs1: ProductOfConditionalInForeachViewState) => [
                        ...(vs1.inStock ? [adoptElement('S1/0', {}, [])] : []),
                        adoptText('S1/1', (vs1) => vs1.price),
                    ],
                    (vs1: ProductOfConditionalInForeachViewState) => {
                        return de('div', { class: 'grid' }, [
                            c(
                                (vs1) => vs1.inStock,
                                () => e('span', { class: 'name' }, [dt((vs1) => vs1.name)]),
                            ),
                            e('span', { class: 'price' }, [dt((vs1) => vs1.price)]),
                        ]);
                    },
                ),
            ]),
        ) as ConditionalInForeachElement;
    return [refManager.getPublicAPI() as ConditionalInForeachElementRefs, render];
}
