import {
    PageViewState,
    PageRefs as PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState,
    PageContract,
} from './page.jay-contract';

import { JayElement, RenderElement, RenderElementOptions } from '@jay-framework/runtime';
import { CounterViewState, CounterRefs, IsPositive } from '../counter/counter.jay-contract';

// Re-export contract types for convenience
export {
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState,
    PageContract,
};

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export declare function render(options?: RenderElementOptions): PageElementPreRender;

