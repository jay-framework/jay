import * as React from 'react';
import { ReactElement } from 'react';
import { HTMLElementProxy } from 'jay-runtime';
import {Jay4ReactElementProps, mimicJayElement} from '../../../lib';
import { eventsFor } from '../../../lib';

export interface CounterElementViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
}

export interface CounterElementProps extends Jay4ReactElementProps<CounterElementViewState> {}

export function render({
    vs,
    context,
}: CounterElementProps): ReactElement<CounterElementProps, any> {
    const { count } = vs;
    return (
        <div>
            <button role="sub" {...eventsFor(context, 'subtracter')}>
                -
            </button>
            <span role="value" style={{ margin: '0 16px' }}>
                {count}
            </span>
            <button role="add" {...eventsFor(context, 'adder')}>
                +
            </button>
        </div>
    );
}

export const render2 = mimicJayElement(render)
