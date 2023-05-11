import {CounterElementRefs, render} from './counter.jay.html';
import {makeJayComponent, Props, createMemo, createState} from 'jay-component';

export interface CounterProps {
    title: string
    initialCount: number
    id: string
}
function CounterConstructor({title, initialCount, id}: Props<CounterProps>, refs: CounterElementRefs) {

    let [count, setCount] = createState(initialCount)

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));

    return {
        render: () => ({title, count, id}),
    }
}

export const Counter = makeJayComponent(render, CounterConstructor);

