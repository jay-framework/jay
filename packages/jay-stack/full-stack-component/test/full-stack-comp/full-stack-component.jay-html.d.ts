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

export type FSComponentContract = JayContract<FSComponentViewState, FSComponentElementRefs>;
