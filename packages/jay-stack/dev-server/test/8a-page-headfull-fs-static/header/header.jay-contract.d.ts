import {
    HTMLElementProxy,
    HTMLElementCollectionProxy,
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface HeaderProps {
    logoUrl: string;
}

export interface HeaderViewState {
    logoUrl: string;
    cartCount: number;
}

export interface HeaderRefs {
    increment: HTMLElementProxy<HeaderViewState, HTMLButtonElement>;
}

export interface HeaderRepeatedRefs {
    increment: HTMLElementCollectionProxy<HeaderViewState, HTMLButtonElement>;
}

export type HeaderSlowViewState = Pick<HeaderViewState, 'logoUrl'>;
export type HeaderFastViewState = Pick<HeaderViewState, 'cartCount'>;
export type HeaderInteractiveViewState = Pick<HeaderViewState, 'cartCount'>;

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
