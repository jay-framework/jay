import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { CounterViewState, CounterRefs, IsPositive } from '../counter/counter.jay-contract';

export interface PageViewState {
    counter?: CounterViewState;
    title: string;
    description: string;
}

export interface PageElementRefs {
    submitButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    counter: CounterRefs;
}

export type PageSlowViewState = Pick<PageViewState, 'title'>;

export type PageFastViewState = Pick<PageViewState, 'description'>;

export type PageInteractiveViewState = Pick<PageViewState, 'counter'>;

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];
export type PageContract = JayContract<
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): PageElementPreRender;
