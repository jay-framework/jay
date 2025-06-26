import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface ConditionsWithRepeatedRefViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRepeatedRefElementRefs {
    text1: HTMLElementProxy<ConditionsWithRepeatedRefViewState, HTMLDivElement>;
}

export type ConditionsWithRepeatedRefElement = JayElement<
    ConditionsWithRepeatedRefViewState,
    ConditionsWithRepeatedRefElementRefs
>;
export type ConditionsWithRepeatedRefElementRender = RenderElement<
    ConditionsWithRepeatedRefViewState,
    ConditionsWithRepeatedRefElementRefs,
    ConditionsWithRepeatedRefElement
>;
export type ConditionsWithRepeatedRefElementPreRender = [
    ConditionsWithRepeatedRefElementRefs,
    ConditionsWithRepeatedRefElementRender,
];
export type ConditionsWithRepeatedRefContract = JayContract<
    ConditionsWithRepeatedRefViewState,
    ConditionsWithRepeatedRefElementRefs
>;

export declare function render(
    options?: RenderElementOptions,
): ConditionsWithRepeatedRefElementPreRender;
