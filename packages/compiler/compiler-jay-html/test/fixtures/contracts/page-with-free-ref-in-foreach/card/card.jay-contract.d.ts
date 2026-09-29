import { JayContract } from '@jay-framework/runtime';

export interface TagOfCardViewState {
    id: string;
    label: string;
}

export interface CardViewState {
    heading: string;
    tags: Array<TagOfCardViewState>;
}

export type CardSlowViewState = {};

export type CardFastViewState = Pick<CardViewState, 'heading'> & {
    tags: Array<CardViewState['tags'][number]>;
};

export type CardInteractiveViewState = Pick<CardViewState, 'heading'> & {
    tags: Array<CardViewState['tags'][number]>;
};

export interface CardRefs {}

export interface CardRepeatedRefs {}

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
