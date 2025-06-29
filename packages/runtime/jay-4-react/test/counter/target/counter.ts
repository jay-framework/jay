import { render, CounterElementRefs, render2 } from './counter.jay-html';
import { Props, createSignal, createEvent, makeJayComponent } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    let [count, setCount] = createSignal(initialValue);

    refs.subtracter.onclick(() => setCount(count() - 1));
    refs.adder.onclick(() => setCount(count() + 1));

    let onChange = createEvent<number>((emitter) => emitter.emit(count()));
    let reset = () => {
        setCount(0);
    };
    return {
        render: () => ({ count }),
        onChange,
        reset,
    };
}

export const Counter = makeJayComponent(render2, CounterConstructor);
