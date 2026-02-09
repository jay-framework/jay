import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface ProductCardViewState {
    name: string;
    price: number;
}

export type ProductCardSlowViewState = Pick<ProductCardViewState, 'name'>;

export type ProductCardFastViewState = Pick<ProductCardViewState, 'price'>;

export type ProductCardInteractiveViewState = Pick<ProductCardViewState, 'price'>;

export interface ProductCardRefs {
    addToCart: HTMLElementProxy<ProductCardViewState, HTMLButtonElement>;
}

export interface ProductCardRepeatedRefs {
    addToCart: HTMLElementCollectionProxy<ProductCardViewState, HTMLButtonElement>;
}

export interface ProductCardProps {
    productId: string;
}

export type ProductCardContract = JayContract<
    ProductCardViewState,
    ProductCardRefs,
    ProductCardSlowViewState,
    ProductCardFastViewState,
    ProductCardInteractiveViewState,
    ProductCardProps
>;
