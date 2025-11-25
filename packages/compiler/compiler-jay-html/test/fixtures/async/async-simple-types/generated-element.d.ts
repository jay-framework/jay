import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface AsyncSimpleTypesViewState {
    s1: string;
    p1: Promise<string>;
}

export interface AsyncSimpleTypesElementRefs {}

export type AsyncSimpleTypesSlowViewState = {};
export type AsyncSimpleTypesFastViewState = {};
export type AsyncSimpleTypesInteractiveViewState = AsyncSimpleTypesViewState;

export type AsyncSimpleTypesElement = JayElement<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs
>;
export type AsyncSimpleTypesElementRender = RenderElement<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesElement
>;
export type AsyncSimpleTypesElementPreRender = [
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesElementRender,
];
export type AsyncSimpleTypesContract = JayContract<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesSlowViewState,
    AsyncSimpleTypesFastViewState,
    AsyncSimpleTypesInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): AsyncSimpleTypesElementPreRender;
