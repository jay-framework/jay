import { render, CounterElementRefs } from './counter.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
}

function mkPromise(count: number): Promise<number> {
    return new Promise((resolve) => setTimeout(() => resolve(count), 1000));
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    const [internalCount, setInternalCount] = createSignal(initialValue);

    refs.subtracter.onclick(() => setInternalCount(internalCount() - 1));
    refs.adderButton.onclick(() => setInternalCount(internalCount() + 1));

    // simulate calling an API to get the new count
    const count = createMemo(() => mkPromise(internalCount()));

    return {
        render: () => ({
            count,
        }),
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
