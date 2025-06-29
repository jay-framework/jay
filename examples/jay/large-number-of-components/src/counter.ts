import { render, CounterElementRefs } from './counter.jay-html';
import { createEvent, createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
    counterClass: string;
}

export interface CounterEvent {
    value: number;
}

function CounterConstructor(
    { initialValue, counterClass }: Props<CounterProps>,
    refs: CounterElementRefs,
) {
    const [count, setCount] = createSignal(initialValue);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adderButton.onclick(() => setCount(count() + 1));

    const onChange = createEvent<CounterEvent>((emitter) => {
        emitter.emit({ value: count() });
    });

    return {
        render: () => ({ count, counterClass }),
        onChange,
    };
}

export const Counter = makeJayComponent(render, CounterConstructor);
