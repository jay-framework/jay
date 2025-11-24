import { JayContract } from '../../lib';

export interface FSComponentViewState {
    id: string;
    name: string;
    age: number;
    address: string;
    stars: number;
    rating: number;
}

export interface FSComponentElementRefs {}

// Phase-specific ViewStates for testing
export type FSComponentSlowViewState = Pick<FSComponentViewState, 'id' | 'name' | 'age' | 'address'>;
export type FSComponentFastViewState = Pick<FSComponentViewState, 'stars' | 'rating'>;
export type FSComponentInteractiveViewState = {};

export type FSComponentContract = JayContract<
    FSComponentViewState,
    FSComponentElementRefs,
    FSComponentSlowViewState,
    FSComponentFastViewState,
    FSComponentInteractiveViewState
>;
