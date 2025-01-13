import { HTMLElementProxy } from 'jay-runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, mimicJayElement } from 'jay-4-react';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export interface CounterElementProps extends Jay4ReactElementProps<CounterViewState> {}

export function reactRender({
    vs,
    context,
}: CounterElementProps): ReactElement<CounterElementProps, any> {
    return (
        <div>
            <button {...eventsFor(context, 'subtracter')}>-</button>
            <span style={{ margin: '0 16px' }}>{vs.count}</span>
            <button {...eventsFor(context, 'adderButton')}>+</button>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
