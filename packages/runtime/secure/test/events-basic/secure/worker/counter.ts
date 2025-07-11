import { CounterElementRefs, render } from './counter.jay-html';
import { makeJayComponent, Props, createMemo, createSignal } from '@jay-framework/component';

export interface CounterProps {
    title: string;
    initialCount: number;
}
function CounterConstructor(
    { title, initialCount }: Props<CounterProps>,
    refs: CounterElementRefs,
) {
    let [count, setCount] = createSignal(initialCount);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));

    return {
        render: () => ({ title, count }),
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
