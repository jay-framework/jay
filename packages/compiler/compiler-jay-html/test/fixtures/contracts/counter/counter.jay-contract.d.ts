import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export enum IsPositive {
    positive,
    negative,
}

export interface CounterViewState {
    count: number;
    isPositive: IsPositive;
}

export interface CounterSlowViewState {}

export interface CounterFastViewState {}

export interface CounterInteractiveViewState {
    count: number;
    isPositive: IsPositive;
}

export interface CounterRefs {
    add: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    subtract: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export interface CounterRepeatedRefs {
    add: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
    subtract: HTMLElementCollectionProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterContract = JayContract<
    CounterViewState,
    CounterRefs,
    CounterSlowViewState,
    CounterFastViewState,
    CounterInteractiveViewState
>;
