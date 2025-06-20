import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import {
    NamedContractViewState,
    NamedContractRefs,
} from '../named-counter/named-counter.jay-contract';
import { IsPositive } from '../counter/counter.jay-contract';

export interface PageUsingNamedCounterViewState {
    namedCounter: NamedContractViewState;
}

export interface PageUsingNamedCounterElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageUsingNamedCounterElement = JayElement<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs
>;
export type PageUsingNamedCounterElementRender = RenderElement<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterElement
>;
export type PageUsingNamedCounterElementPreRender = [
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterElementRender,
];

export declare function render(options?: RenderElementOptions): PageUsingNamedCounterElementPreRender;
