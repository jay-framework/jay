import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface ScrollCarouselViewState {
  atStart: boolean,
  atEnd: boolean
}

export type ScrollCarouselSlowViewState = {};

export type ScrollCarouselFastViewState = Pick<ScrollCarouselViewState, 'atStart' | 'atEnd'>;

export type ScrollCarouselInteractiveViewState = Pick<ScrollCarouselViewState, 'atStart' | 'atEnd'>;


export interface ScrollCarouselRefs {
  container: HTMLElementProxy<ScrollCarouselViewState, HTMLElement>,
  prev: HTMLElementProxy<ScrollCarouselViewState, HTMLButtonElement>,
  next: HTMLElementProxy<ScrollCarouselViewState, HTMLButtonElement>
}


export interface ScrollCarouselRepeatedRefs {
  container: HTMLElementCollectionProxy<ScrollCarouselViewState, HTMLElement>,
  prev: HTMLElementCollectionProxy<ScrollCarouselViewState, HTMLButtonElement>,
  next: HTMLElementCollectionProxy<ScrollCarouselViewState, HTMLButtonElement>
}

export type ScrollCarouselContract = JayContract<ScrollCarouselViewState, ScrollCarouselRefs, ScrollCarouselSlowViewState, ScrollCarouselFastViewState, ScrollCarouselInteractiveViewState>