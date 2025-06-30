import { render, AutoCounterElementRefs } from './auto-counter.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';
import { exec$ } from '@jay-framework/secure';
import { moduleDoCount } from './a-module';

export interface AutoCounterProps {
    initialValue: number;
}

function AutoCounterConstructor(
    { initialValue }: Props<AutoCounterProps>,
    refs: AutoCounterElementRefs,
) {
    let [count, setCount] = createSignal(initialValue);

    let cycles = 0;
    async function doCount() {
        cycles = 0;
        while (cycles < 1000) {
            setCount(count() + 1);
            await exec$(() => new Promise((resolve) => requestAnimationFrame(resolve)));
            cycles += 1;
        }
    }

    refs.autoCount1.onclick(() => doCount());
    refs.autoCount1.onclick(() => moduleDoCount(() => setCount(count() + 1)));

    return {
        render: () => ({ count }),
    };
}

export const AutoCounter = makeJayComponent(render, AutoCounterConstructor);
