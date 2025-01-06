import { CounterElementRefs, render } from './counter.jay-html';
import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';
import { FC } from 'react';
import { makeJay2ReactComponent } from 'jay-4-react';

export interface CounterProps {
    initialValue: number;
}

function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    let [count, setCount] = createSignal(initialValue);
    refs.adderButton.onclick(() => setCount(count() + 1));
    refs.subtracter.onclick(() => setCount(count() - 1));
    let onChange = createEvent<number>((emitter) => emitter.emit(count()));
    let reset = () => {
        setCount(0);
    };
    return {
        render: () => ({ count }),
        onChange,
        reset,
    };
}

export const Counter = makeJay2ReactComponent(render, CounterComponent)