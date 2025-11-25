import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import {
    NamedContractViewState,
    NamedContractRefs,
} from '../named-counter/named-counter.jay-contract';
import { IsPositive } from '../counter/counter.jay-contract';

export interface PageUsingNamedCounterViewState {
    namedCounter?: NamedContractViewState;
}

export interface PageUsingNamedCounterElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageUsingNamedCounterSlowViewState = {};
export type PageUsingNamedCounterFastViewState = {};
export type PageUsingNamedCounterInteractiveViewState = PageUsingNamedCounterViewState;

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
export type PageUsingNamedCounterContract = JayContract<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterSlowViewState,
    PageUsingNamedCounterFastViewState,
    PageUsingNamedCounterInteractiveViewState
>;

export declare function render(
    options?: RenderElementOptions,
): PageUsingNamedCounterElementPreRender;
