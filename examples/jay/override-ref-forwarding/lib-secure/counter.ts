import { CounterElementRefs, render } from './counter.jay-html';
import { createEvent, createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
}

function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    const [count, setCount] = createSignal(initialValue());

    // `onChange` is the event forwarded across the pure composite. Even though this Counter is
    // *injected into the card via <override>* (not authored in the card), its ref is spliced into
    // the card body at compile time, so Phase 3 forwards it exactly like a hardcoded inner ref —
    // registered at the page as `refs.signupCard.cta.onChange(...)`, firing with the counter's own
    // emitted value, no event re-basing (DL#193 §B).
    const onChange = createEvent<number>();

    refs.adder.onclick(() => {
        const next = count() + 1;
        setCount(next);
        onChange.emit(next);
    });
    refs.subtracter.onclick(() => {
        const next = count() - 1;
        setCount(next);
        onChange.emit(next);
    });

    return {
        render: () => ({ count }),
        onChange,
    };
}

export const Counter = makeJayComponent(render, CounterComponent);
