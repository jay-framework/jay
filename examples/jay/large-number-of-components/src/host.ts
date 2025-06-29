import { Counter, HostElementRefs, render } from './host.jay-html';
import {
    createDerivedArray,
    createEffect,
    createMemo,
    createSignal,
    makeJayComponent,
    Props,
} from '@jay-framework/component';
import { patch, REPLACE } from '@jay-framework/json-patch';
import { JayEvent } from '@jay-framework/runtime';
import { CounterEvent } from './counter';

export interface HostProps {}

const COUNTER_CLASSES = [
    'blueCounter',
    'lavenderCounter',
    'grayCounter',
    'purpleCounter',
    'yellowCounter',
];

let nextCreationIndex = 0;
interface CounterData {
    currentCount: number;
    key: string;
}
function HostConstructor({}: Props<HostProps>, refs: HostElementRefs) {
    const [numberOfCounters, setNumberOfCounters] = createSignal(100);
    const [counterData, setCounterData] = createSignal<CounterData[]>([]);

    createEffect(() => {
        const prev = counterData();
        if (prev.length !== numberOfCounters()) {
            for (let i = prev.length; i < numberOfCounters(); i++)
                prev.push({ currentCount: i, key: '' + nextCreationIndex++ });
            setCounterData(prev.slice(0, numberOfCounters()));
        }
    });

    const counters = createDerivedArray<CounterData, Counter>(counterData, (internalCounter) => {
        return {
            key: internalCounter().key,
            count: internalCounter().currentCount,
            counterClass: COUNTER_CLASSES[internalCounter().currentCount % COUNTER_CLASSES.length],
        };
    });

    const total = createMemo(() => {
        return counterData().reduce((prev, curr) => prev + curr.currentCount, 0);
    });

    refs.numberOfCounters.oninput(({ event }) => {
        const newValue = (event.target as HTMLInputElement).value;
        if (Number(newValue)) setNumberOfCounters(Number(newValue));
    });

    refs.counter.onChange(({ coordinate, event }: JayEvent<CounterEvent, Counter>) => {
        console.log(coordinate, event);
        const counterIndex = counterData().findIndex(
            (internalCounter) => internalCounter.key === coordinate[0],
        );
        if (counterData()[counterIndex].currentCount !== event.value)
            setCounterData(
                patch(counterData(), [
                    { op: REPLACE, path: [counterIndex, 'currentCount'], value: event.value },
                ]),
            );
    });

    return {
        render: () => ({ numberOfCounters, counters, total }),
    };
}

export const Host = makeJayComponent(render, HostConstructor);
