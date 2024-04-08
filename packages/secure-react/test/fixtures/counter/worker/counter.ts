import { CounterElementRefs, render } from './counter.jay-html';
import { makeJayComponent, Props, createState, createEvent } from 'jay-component';

export interface CounterProps {
    initialCount: number;
}
function CounterConstructor(
    {initialCount}: Props<CounterProps>,
    refs: CounterElementRefs,
) {
    let [count, setCount] = createState(initialCount);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));
    return {
        render: () => ({ count})
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
