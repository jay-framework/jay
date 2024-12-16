import * as React from 'react';
import { ReactElement } from 'react';
import { HTMLElementProxy } from 'jay-runtime';
import { Jay4ReactElementProps } from '../../lib';
import { eventsFor, JayReactElementEvents, JayReactEvents } from '../../lib';

export interface CounterElementViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
}

export interface CounterElementEvents extends JayReactEvents {
    subtracter: JayReactElementEvents;
    adder: JayReactElementEvents;
}

export interface CounterElementProps
    extends Jay4ReactElementProps<CounterElementViewState, CounterElementEvents> {}

export function render({
    viewState,
    events: { subtracter, adder },
    eventsWrapper,
}: CounterElementProps): ReactElement<CounterElementProps, any> {
    const { count } = viewState;
    return (
        <div>
            <button role="sub" {...eventsFor(['subtracter'], viewState, subtracter, eventsWrapper)}>
                -
            </button>
            <span role="value" style={{ margin: '0 16px' }}>
                {count}
            </span>
            <button role="add" {...eventsFor(['adder'], viewState, adder, eventsWrapper)}>
                +
            </button>
        </div>
    );
}
