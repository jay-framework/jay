import {
    HTMLElementProxy,
    HTMLElementCollectionProxy,
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface HeaderProps {
    itemId: string;
}

export interface HeaderViewState {
    label: string;
    value: number;
}

export interface HeaderRefs {
    increment: HTMLElementProxy<HeaderViewState, HTMLButtonElement>;
}

export interface HeaderRepeatedRefs {
    increment: HTMLElementCollectionProxy<HeaderViewState, HTMLButtonElement>;
}

export type HeaderSlowViewState = Pick<HeaderViewState, 'label'>;
export type HeaderFastViewState = Pick<HeaderViewState, 'value'>;
export type HeaderInteractiveViewState = Pick<HeaderViewState, 'value'>;

export type HeaderElement = JayElement<HeaderViewState, HeaderRefs>;
export type HeaderElementRender = RenderElement<HeaderViewState, HeaderRefs, HeaderElement>;
export type HeaderElementPreRender = [HeaderRefs, HeaderElementRender];
export type HeaderContract = JayContract<
    HeaderViewState,
    HeaderRefs,
    HeaderSlowViewState,
    HeaderFastViewState,
    HeaderInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): HeaderElementPreRender;
