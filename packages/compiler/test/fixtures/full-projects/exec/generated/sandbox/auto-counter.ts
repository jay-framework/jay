import { render, AutoCounterElementRefs } from './auto-counter.jay-html?jay-workerSandbox';
import { createState, makeJayComponent, Props } from 'jay-component';
import {exec$, funcGlobal$} from "jay-secure";
import {moduleDoCount} from "./a-module?jay-workerSandbox";
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
            setCount(count() + 1)
            await exec$(funcGlobal$('2'))
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
