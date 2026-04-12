import {
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
}

export interface HeaderRefs {}

export interface HeaderRepeatedRefs {}

export type HeaderSlowViewState = HeaderViewState;
export type HeaderFastViewState = {};
export type HeaderInteractiveViewState = {};

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
