import * as React from 'react';
import {
    JayReactElementEvents,
    JayReactEvents
} from '../../../lib/main-element-events';
import {ReactElement} from "react";
import {HTMLElementProxy} from "jay-runtime";
import {Jay4ReactElementProps} from "../../../lib";
import {eventsFor} from "../../../lib/jay4react-events";

export interface CounterElementViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>,
    adder: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>
}

export interface CounterElementEvents extends JayReactEvents {
    subtracter: JayReactElementEvents;
    adder: JayReactElementEvents;
}

export interface CounterElementProps extends Jay4ReactElementProps<CounterElementViewState, CounterElementEvents> {
    viewState: CounterElementViewState;
    events: CounterElementEvents;
}

export function CounterElement({ viewState, events: { subtracter, adder } }: CounterElementProps): ReactElement<CounterElementProps, any> {
    const { count } = viewState;
    return (
        <div>
            <button {...eventsFor(['subtracter'], viewState, subtracter)}>-</button>
            <span role="value" style={{margin: '0 16px'}}>
                {count}
            </span>
            <button {...eventsFor(['adder'], viewState, adder)}>+</button>
        </div>
    );
}
