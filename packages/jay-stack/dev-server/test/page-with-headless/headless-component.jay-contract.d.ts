import { JayContract, JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';

export interface HeadlessComponentViewState {
    content: string;
}

export interface HeadlessComponentRefs {}

export interface HeadlessComponentRepeatedRefs {}

export type HeadlessComponentElement = JayElement<
    HeadlessComponentViewState,
    HeadlessComponentRefs
>;
export type HeadlessComponentElementRender = RenderElement<
    HeadlessComponentViewState,
    HeadlessComponentRefs,
    HeadlessComponentElement
>;
export type HeadlessComponentElementPreRender = [
    HeadlessComponentRefs,
    HeadlessComponentElementRender,
];
export type HeadlessComponentContract = JayContract<
    HeadlessComponentViewState,
    HeadlessComponentRefs
>;

export declare function render(options?: RenderElementOptions): HeadlessComponentElementPreRender;
