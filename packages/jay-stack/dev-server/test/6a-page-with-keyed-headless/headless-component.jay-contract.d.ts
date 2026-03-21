import {
    JayContract,
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface HeadlessComponentViewState {
    label: string;
    count: number;
}

export interface HeadlessComponentRefs {
    increment: HTMLElementProxy<HeadlessComponentViewState, HTMLButtonElement>;
}

export interface HeadlessComponentRepeatedRefs {
    increment: HTMLElementProxy<HeadlessComponentViewState, HTMLButtonElement>;
}

export type HeadlessComponentSlowViewState = Pick<HeadlessComponentViewState, 'label'>;
export type HeadlessComponentFastViewState = Pick<HeadlessComponentViewState, 'count'>;
export type HeadlessComponentInteractiveViewState = Pick<HeadlessComponentViewState, 'count'>;

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
    HeadlessComponentRefs,
    HeadlessComponentSlowViewState,
    HeadlessComponentFastViewState,
    HeadlessComponentInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): HeadlessComponentElementPreRender;
