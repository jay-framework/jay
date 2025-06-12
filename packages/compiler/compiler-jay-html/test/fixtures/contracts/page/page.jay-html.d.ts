import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import {
    NamedContractViewState,
    NamedContractRefs,
} from '../named-counter/named-counter.jay-contract';
// @ts-ignore
import { namedCounter } from '../named-counter/named-counter';

export interface PageViewState {
    namedCounter: NamedContractViewState;
}

export interface PageElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;
