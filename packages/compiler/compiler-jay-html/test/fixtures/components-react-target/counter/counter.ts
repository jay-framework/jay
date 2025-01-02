import { CounterElementRefs, render } from './generated-react-element';
import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
    initialValue: number;
}

function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    let [count, setCount] = createSignal(initialValue);
    refs.adderButton.onclick(() => setCount(count() + 1));
    refs.subtracter.onclick(() => setCount(count() - 1));
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

//@ts-ignore
export const Counter = makeJayComponent(render, CounterComponent);
