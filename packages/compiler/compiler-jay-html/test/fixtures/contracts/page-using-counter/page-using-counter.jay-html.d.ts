import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { CounterViewState, CounterRefs, IsPositive } from '../counter/counter.jay-contract';

export interface PageUsingCounterViewState {
    counter?: CounterViewState;
}

export interface PageUsingCounterElementRefs {
    counter: CounterRefs;
}

export type PageUsingCounterElement = JayElement<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs
>;
export type PageUsingCounterElementRender = RenderElement<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs,
    PageUsingCounterElement
>;
export type PageUsingCounterElementPreRender = [
    PageUsingCounterElementRefs,
    PageUsingCounterElementRender,
];
export type PageUsingCounterContract = JayContract<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs
>;

export declare function render(options?: RenderElementOptions): PageUsingCounterElementPreRender;
