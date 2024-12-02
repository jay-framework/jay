import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
    counterClass: string;
}

function CounterConstructor({ initialValue, counterClass }: Props<CounterProps>, refs: CounterElementRefs) {
    const [count, setCount] = createSignal(initialValue);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adderButton.onclick(() => setCount(count() + 1));

    return {
        render: () => ({ count, counterClass }),
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
