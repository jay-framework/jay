import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface CardViewState {
    heading: string;
}

export type CardSlowViewState = {};

export type CardFastViewState = Pick<CardViewState, 'heading'>;

export type CardInteractiveViewState = Pick<CardViewState, 'heading'>;

export interface CardRefs {
    cardAction: HTMLElementProxy<CardViewState, HTMLButtonElement>;
}

export interface CardRepeatedRefs {
    cardAction: HTMLElementCollectionProxy<CardViewState, HTMLButtonElement>;
}

export interface CardProps {
    heading: string;
}

export type CardContract = JayContract<
    CardViewState,
    CardRefs,
    CardSlowViewState,
    CardFastViewState,
    CardInteractiveViewState,
    CardProps
>;
