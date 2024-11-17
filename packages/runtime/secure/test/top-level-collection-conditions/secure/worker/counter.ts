import { CounterElementRefs, render } from './counter.jay-html';
import { makeJayComponent, Props, createSignal, createEvent } from 'jay-component';

export interface CounterProps {
    title: string;
    initialCount: number;
    id: string;
}
interface CounterChangeEvent {
    value: number;
}
function CounterConstructor(
    { title, initialCount, id }: Props<CounterProps>,
    refs: CounterElementRefs,
) {
    let [count, setCount] = createSignal(initialCount);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));
    let onChange = createEvent<CounterChangeEvent>((emitter) => emitter.emit({ value: count() }));
    let counterDescription = () => `${title()}: ${count()}`;
    return {
        render: () => ({ title, count, id }),
        onChange,
        counterDescription,
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
