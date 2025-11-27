import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ConditionsWithRefsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRefsElementRefs {
    text1: HTMLElementProxy<ConditionsWithRefsViewState, HTMLDivElement>;
    text2: HTMLElementProxy<ConditionsWithRefsViewState, HTMLSpanElement>;
}

export type ConditionsWithRefsSlowViewState = {};
export type ConditionsWithRefsFastViewState = {};
export type ConditionsWithRefsInteractiveViewState = ConditionsWithRefsViewState;

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
export type ConditionsWithRefsContract = JayContract<
    ConditionsWithRefsViewState,
    ConditionsWithRefsElementRefs,
    ConditionsWithRefsSlowViewState,
    ConditionsWithRefsFastViewState,
    ConditionsWithRefsInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): ConditionsWithRefsElementPreRender;
