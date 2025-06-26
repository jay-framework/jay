import { JayElement, RenderElement, HTMLElementProxy, RenderElementOptions, JayContract } from 'jay-runtime';

export interface AutoCounterViewState {
    count: number;
}

export interface AutoCounterElementRefs {
    autoCount1: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
    autoCount2: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
}

export type AutoCounterElement = JayElement<AutoCounterViewState, AutoCounterElementRefs>;
export type AutoCounterElementRender = RenderElement<
    AutoCounterViewState,
    AutoCounterElementRefs,
    AutoCounterElement
>;
export type AutoCounterElementPreRender = [AutoCounterElementRefs, AutoCounterElementRender];
export type AutoCounterContract = JayContract<AutoCounterViewState, AutoCounterElementRefs>;

export declare function render(options?: RenderElementOptions): AutoCounterElementPreRender;
