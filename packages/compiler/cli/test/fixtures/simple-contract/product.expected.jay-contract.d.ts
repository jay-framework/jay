import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface ProductViewState {
    name: string;
    price: number;
    quantity: number;
}

export type ProductSlowViewState = Pick<ProductViewState, 'name'>;

export type ProductFastViewState = Pick<ProductViewState, 'price' | 'quantity'>;

export type ProductInteractiveViewState = Pick<ProductViewState, 'quantity'>;

export interface ProductRefs {
    addToCart: HTMLElementProxy<ProductViewState, HTMLButtonElement>;
}

export interface ProductRepeatedRefs {
    addToCart: HTMLElementCollectionProxy<ProductViewState, HTMLButtonElement>;
}

export type ProductContract = JayContract<
    ProductViewState,
    ProductRefs,
    ProductSlowViewState,
    ProductFastViewState,
    ProductInteractiveViewState
>;
