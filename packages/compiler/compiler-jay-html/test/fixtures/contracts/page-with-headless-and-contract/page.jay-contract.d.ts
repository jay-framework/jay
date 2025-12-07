import { JayContract, HTMLElementProxy } from '@jay-framework/runtime';
import { CounterViewState, CounterRefs } from '../counter/counter.jay-contract';

export interface PageViewState {
    title: string;
    description: string;
    counter?: CounterViewState;
}

export interface PageRefs {
    submitButton: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    counter: CounterRefs;
}

export type PageSlowViewState = Pick<PageViewState, 'title'>;
export type PageFastViewState = Pick<PageViewState, 'description'>;
export type PageInteractiveViewState = Pick<PageViewState, 'counter'>;

export type PageContract = JayContract<
    PageViewState,
    PageRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

