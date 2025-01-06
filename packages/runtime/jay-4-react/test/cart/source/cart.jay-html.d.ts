import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    HTMLElementCollectionProxy
} from 'jay-runtime';

export interface CartLineItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
}

export interface CartElementViewState {
    lineItems: CartLineItem[];
    minimumOrderReached: boolean;
    total: number;
}

export interface CartElementRefs {
    checkout: HTMLElementProxy<CartElementViewState, HTMLButtonElement>;
    removeItem: HTMLElementCollectionProxy<CartElementViewState, HTMLButtonElement>;
    continueShopping: HTMLElementProxy<CartElementViewState, HTMLButtonElement>;
}

export type CartElement = JayElement<CartElementViewState, CartElementRefs>;
export type CartElementRender = RenderElement<
    CartViewState,
    CartElementRefs,
    CartElement
>;
export type CounterElementPreRender = [CartElementRefs, CartElementRender];

export declare function render(options?: RenderElementOptions): CartElementPreRender;
