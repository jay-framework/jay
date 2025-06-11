import {
    HTMLElementCollectionProxy,
    HTMLElementProxy,
} from 'jay-runtime';
import { JayContract } from 'jay-fullstack-component';

export interface CounterViewState {
    count: number;
}

export interface CounterRefs {
    add: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    subtract: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export interface CounterRepeatedRefs {
    add: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
    subtract: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterContract = JayContract<CounterViewState, CounterRefs>;
