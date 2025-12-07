import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface PageViewState {
  title: string,
  description: string,
  price: number,
  stock: number
}

export type PageSlowViewState = Pick<PageViewState, 'title' | 'description'>;

export type PageFastViewState = Pick<PageViewState, 'price' | 'stock'>;

export type PageInteractiveViewState = Pick<PageViewState, 'stock'>;


export interface PageRefs {
  buyButton: HTMLElementProxy<PageViewState, HTMLButtonElement>
}


export interface PageRepeatedRefs {
  buyButton: HTMLElementCollectionProxy<PageViewState, HTMLButtonElement>
}

export type PageContract = JayContract<PageViewState, PageRefs, PageSlowViewState, PageFastViewState, PageInteractiveViewState>