import { render, CounterElementRefs } from './counter.jay-html';
import { createState, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    let [count, setCount] = createState(initialValue);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adderButton.onclick(() => setCount(count() + 1));

    return {
        render: () => ({ count }),
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
