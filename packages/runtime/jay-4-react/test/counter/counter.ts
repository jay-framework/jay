import { render, CounterElementRefs } from './counter.jay-html';
import { makeJayComponent, Props, createSignal } from 'jay-component';
import { jay4react } from '../../lib';
import { FC } from 'react';

export interface CounterProps {
    initialCount: number;
}
function CounterConstructor({ initialCount }: Props<CounterProps>, refs: CounterElementRefs) {
    let [count, setCount] = createSignal(initialCount);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));
    return {
        render: () => ({ count }),
    };
}

export interface ReactCounterProps extends CounterProps {}
export const Counter: FC<ReactCounterProps> = jay4react(render, (preRender) =>
    makeJayComponent(preRender, CounterConstructor),
);
