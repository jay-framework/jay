import * as React from 'react';
import { ReactElement } from 'react';
import { HTMLElementProxy } from 'jay-runtime';
import { Jay4ReactElementProps } from '../../lib';
import { eventsFor } from '../../lib';

export interface CounterElementViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
}

export interface CounterElementProps
    extends Jay4ReactElementProps<CounterElementViewState> {}

export function render({viewState, eventsContext}: CounterElementProps): ReactElement<CounterElementProps, any> {
    const { count } = viewState;
    return (
        <div>
            <button role="sub" {...eventsFor(eventsContext, 'subtracter')}>
                -
            </button>
            <span role="value" style={{ margin: '0 16px' }}>
                {count}
            </span>
            <button role="add" {...eventsFor(eventsContext, 'adder')}>
                +
            </button>
        </div>
    );
}
