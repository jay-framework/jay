import { render, CounterElementRefs } from './counter.jay-html?jay-sandboxWorker';
import { createState, makeJayComponent, Props } from 'jay-component';
export interface CounterProps {
    initialValue: number;
    incrementBy: number;
}
function CounterConstructor(
    { initialValue, incrementBy }: Props<CounterProps>,
    refs: CounterElementRefs,
) {
    let [count, setCount] = createState(initialValue);
    refs.subtracter.onclick(() => setCount(count() - incrementBy()));
    refs.adderButton.onclick(() => setCount(count() + incrementBy()));
    return {
        render: () => ({ count }),
    };
}
export const Counter = makeJayComponent(render, CounterConstructor);
