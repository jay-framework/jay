import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface HeadlessComponentViewState {
    message: string;
    isActive: boolean;
    invalid: boolean;
}

export type HeadlessComponentSlowViewState = {};

export type HeadlessComponentFastViewState = Pick<
    HeadlessComponentViewState,
    'message' | 'isActive' | 'invalid'
>;

export type HeadlessComponentInteractiveViewState = Pick<
    HeadlessComponentViewState,
    'message' | 'isActive' | 'invalid'
>;

export interface HeadlessComponentRefs {
    toggle: HTMLElementProxy<HeadlessComponentViewState, HTMLButtonElement>;
}

export interface HeadlessComponentRepeatedRefs {
    toggle: HTMLElementCollectionProxy<HeadlessComponentViewState, HTMLButtonElement>;
}

export type HeadlessComponentContract = JayContract<
    HeadlessComponentViewState,
    HeadlessComponentRefs,
    HeadlessComponentSlowViewState,
    HeadlessComponentFastViewState,
    HeadlessComponentInteractiveViewState
>;
