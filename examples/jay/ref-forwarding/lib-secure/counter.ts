import { CounterElementRefs, render } from './counter.jay-html';
import { createEvent, createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CounterProps {
    initialValue: number;
}

function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
    const [count, setCount] = createSignal(initialValue());

    // `onChange` is the event forwarded across the pure composite. Its handler is registered at the
    // page usage site as `refs.signupCard.cta.onChange(...)` (single) / `refs.cards.cards.cta` (list),
    // yet it fires with the counter's own emitted value — no event re-basing (DL#193 §B).
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
