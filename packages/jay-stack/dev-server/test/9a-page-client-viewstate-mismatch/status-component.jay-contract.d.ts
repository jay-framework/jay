import {
    JayContract,
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface StatusComponentViewState {
    showBanner: boolean;
    bannerText: string;
    counter: number;
}

export interface StatusComponentRefs {
    increment: HTMLElementProxy<StatusComponentViewState, HTMLButtonElement>;
}

export interface StatusComponentRepeatedRefs {
    increment: HTMLElementProxy<StatusComponentViewState, HTMLButtonElement>;
}

export type StatusComponentSlowViewState = {};
export type StatusComponentFastViewState = StatusComponentViewState;
export type StatusComponentInteractiveViewState = StatusComponentViewState;

export type StatusComponentElement = JayElement<
    StatusComponentViewState,
    StatusComponentRefs
>;
export type StatusComponentElementRender = RenderElement<
    StatusComponentViewState,
    StatusComponentRefs,
    StatusComponentElement
>;
export type StatusComponentElementPreRender = [
    StatusComponentRefs,
    StatusComponentElementRender,
];
export type StatusComponentContract = JayContract<
    StatusComponentViewState,
    StatusComponentRefs,
    StatusComponentSlowViewState,
    StatusComponentFastViewState,
    StatusComponentInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): StatusComponentElementPreRender;
