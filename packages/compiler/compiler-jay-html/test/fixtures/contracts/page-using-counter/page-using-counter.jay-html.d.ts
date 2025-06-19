import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import {
    CounterViewState,
    CounterRefs,
    IsPositive
} from '../counter/counter.jay-contract';

export interface PageUsingCounterViewState {
    counter: CounterViewState;
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

export declare function render(options?: RenderElementOptions): PageUsingCounterElementPreRender;
