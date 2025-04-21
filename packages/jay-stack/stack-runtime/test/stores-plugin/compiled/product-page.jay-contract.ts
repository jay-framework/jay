import {
    JayElement,
    RenderElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
} from 'jay-runtime';
import { DiscountViewState, DiscountRefs, DiscountRepeatedRefs } from './discount.jay-contract';
import {
    MediaItemViewState,
    MediaItemRefs,
    MediaItemRepeatedRefs,
} from './media-item.jay-contract';

export interface Media {
    items: Array<MediaItemViewState>;
    mainMedia: MediaItemViewState;
}

export interface Formatted {
    discountedPrice: string;
    price: string;
    pricePerUnit: string;
}

export interface PriceData {
    currency: string;
    discountedPrice: number;
    formatted: Formatted;
    price: number;
    pricePerUnit: number;
}

export enum ProductType {
    digital,
    physical,
}

export interface ProductPageViewState {
    id: string;
    brand: string;
    description: string;
    discount: DiscountViewState;
    hasDiscount: boolean;
    media: Media;
    name: string;
    inStock: boolean;
    slug: string;
    priceData: PriceData;
    productType: ProductType;
    ribbon: string;
}

export interface ProductPageRefs {
    discount: DiscountRefs;
    items: MediaItemRepeatedRefs;
    mainMedia: MediaItemRefs;
    addToCart: HTMLElementProxy<ProductPageViewState, HTMLButtonElement>;
}

export interface ProductPageRepeatedRefs {
    discount: DiscountRepeatedRefs;
    items: MediaItemRepeatedRefs;
    mainMedia: MediaItemRepeatedRefs;
    addToCart: HTMLElementCollectionProxy<ProductPageViewState, HTMLButtonElement>;
}

export type ProductPageElement = JayElement<ProductPageViewState, ProductPageRefs>;
export type ProductPageElementRender = RenderElement<
    ProductPageViewState,
    ProductPageRefs,
    ProductPageElement
>;
export type ProductPageElementPreRender = [ProductPageRefs, ProductPageElementRender];

export declare function render(options?: RenderElementOptions): ProductPageElementPreRender;
