import {
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface LayoutViewState {
    sidebarLabel: string;
}

export interface LayoutRefs {}

export interface LayoutRepeatedRefs {}

export type LayoutSlowViewState = LayoutViewState;
export type LayoutFastViewState = {};
export type LayoutInteractiveViewState = {};

export type LayoutElement = JayElement<LayoutViewState, LayoutRefs>;
export type LayoutElementRender = RenderElement<LayoutViewState, LayoutRefs, LayoutElement>;
export type LayoutElementPreRender = [LayoutRefs, LayoutElementRender];
export type LayoutContract = JayContract<
    LayoutViewState,
    LayoutRefs,
    LayoutSlowViewState,
    LayoutFastViewState,
    LayoutInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): LayoutElementPreRender;
