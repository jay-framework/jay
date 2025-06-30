import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    const [count, setCount] = createSignal(initialValue);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adderButton.onclick(() => setCount(count() + 1));

    return {
        render: () => ({ count }),
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
