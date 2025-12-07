import {
    PageViewState as PageContractViewState,
    PageRefs as PageContractRefs,
    PageRepeatedRefs as PageContractRepeatedRefs,
    PageSlowViewState as PageContractSlowViewState,
    PageFastViewState as PageContractFastViewState,
    PageInteractiveViewState as PageContractInteractiveViewState,
} from './page.jay-contract';

import { CounterViewState, CounterRefs, CounterRepeatedRefs, IsPositive } from '../counter/counter.jay-contract';

import { JayElement, RenderElement, RenderElementOptions, JayContract } from '@jay-framework/runtime';

// Extended ViewState that includes headless component types
export interface PageViewState extends PageContractViewState {
    counter?: CounterViewState;
}

// Extended Refs that includes headless component refs
export interface PageElementRefs extends PageContractRefs {
    counter: CounterRefs;
}

// Extended RepeatedRefs that includes headless component repeated refs
export interface PageElementRepeatedRefs extends PageContractRepeatedRefs {
    counter: CounterRepeatedRefs;
}

// Phase-specific types based on the extended ViewState
export type PageSlowViewState = PageContractSlowViewState;
export type PageFastViewState = PageContractFastViewState;
export type PageInteractiveViewState = PageContractInteractiveViewState & {
    counter?: CounterViewState;
};

export type PageContract = JayContract<
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;

