// @ts-expect-error Cannot find module
import { render, AutoCounterElementRefs } from './auto-counter.jay-html?jay-workerSandbox';
import { createState, makeJayComponent, Props } from 'jay-component';
import { exec$ } from 'jay-secure';
// @ts-expect-error Cannot find module
import { moduleDoCount } from './a-module?jay-workerSandbox';
import { funcGlobal$ } from 'jay-secure';
export interface AutoCounterProps {
    initialValue: number;
}
function AutoCounterConstructor(
    { initialValue }: Props<AutoCounterProps>,
    refs: AutoCounterElementRefs,
) {
    let [count, setCount] = createState(initialValue);
    let cycles = 0;
    async function doCount() {
        cycles = 0;
        while (cycles < 1000) {
            setCount(count() + 1);
            await exec$(funcGlobal$('0'));
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
