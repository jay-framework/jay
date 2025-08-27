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

export type AsyncSimpleTypesElement = JayElement<AsyncSimpleTypesViewState, AsyncSimpleTypesElementRefs>;
export type AsyncSimpleTypesElementRender = RenderElement<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesElement
>;
export type AsyncSimpleTypesElementPreRender = [AsyncSimpleTypesElementRefs, AsyncSimpleTypesElementRender];
export type AsyncSimpleTypesContract = JayContract<AsyncSimpleTypesViewState, AsyncSimpleTypesElementRefs>;

export declare function render(options?: RenderElementOptions): AsyncSimpleTypesElementPreRender;
