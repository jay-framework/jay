import { JayElement, RenderElement, HTMLElementProxy, RenderElementOptions } from 'jay-runtime';

export interface ConditionsWithRefsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRefsElementRefs {
    text1: HTMLElementProxy<ConditionsWithRefsViewState, HTMLDivElement>;
    text2: HTMLElementProxy<ConditionsWithRefsViewState, HTMLSpanElement>;
}

export type ConditionsWithRefsElement = JayElement<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs
>;
export type ConditionsWithRefsElementRender = RenderElement<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs,
    ConditionsWithRefsElement
>;
export type ConditionsWithRefsElementPreRender = [
    ConditionsWithRefsElementRefs,
    ConditionsWithRefsElementRender,
];

export declare function render(options?: RenderElementOptions): ConditionsWithRefsElementPreRender;
