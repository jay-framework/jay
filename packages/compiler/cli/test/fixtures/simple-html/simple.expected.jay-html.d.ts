import {JayElement, RenderElement, RenderElementOptions, JayContract} from "@jay-framework/runtime";

export interface SimpleViewState {
  title: string,
  content: string
}

export interface SimpleElementRefs {}

export type SimpleSlowViewState = {};
export type SimpleFastViewState = {};
export type SimpleInteractiveViewState = SimpleViewState;

export type SimpleElement = JayElement<SimpleViewState, SimpleElementRefs>
export type SimpleElementRender = RenderElement<SimpleViewState, SimpleElementRefs, SimpleElement>
export type SimpleElementPreRender = [SimpleElementRefs, SimpleElementRender]
export type SimpleContract = JayContract<
    SimpleViewState,
    SimpleElementRefs,
    SimpleSlowViewState,
    SimpleFastViewState,
    SimpleInteractiveViewState
>;


export declare function render(options?: RenderElementOptions): SimpleElementPreRender