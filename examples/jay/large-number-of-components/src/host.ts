import {render, HostElementRefs, Counter} from './host.jay-html';
import {createDerivedArray, createMemo, createSignal, makeJayComponent, Props} from 'jay-component';

export interface HostProps {
}

const COUNTER_CLASSES = [
    "blueCounter", "lavenderCounter", "grayCounter", "purpleCounter", "yellowCounter"]

let nextCreationIndex = 0;
interface InternalCounter {
    currentCount: number;
    key: string;
}
function HostConstructor({  }: Props<HostProps>, refs: HostElementRefs) {

    const [numberOfCounters, setNumberOfCounters] = createSignal(100);
    const internalCounters = createMemo<InternalCounter[]>(prev => {
        for (let i = prev.length; i < numberOfCounters(); i++)
            prev.push({currentCount: i, key: ''+nextCreationIndex++})
        return prev.slice(0, numberOfCounters());
    }, [])

    const counters = createDerivedArray<InternalCounter, Counter>(internalCounters,
        (internalCounter) => {
        return ({
            key: internalCounter().key,
            count: internalCounter().currentCount,
            counterClass: COUNTER_CLASSES[internalCounter().currentCount % COUNTER_CLASSES.length]
        })
    })

    const total = createMemo(() => {
        return internalCounters().reduce((prev, curr) => prev + curr.currentCount, 0)
    })

    refs.numberOfCounters.oninput(({event}) => {
        const newValue = (event.target as HTMLInputElement).value;
        if (Number(newValue))
            setNumberOfCounters(Number(newValue))
    })

    return {
        render: () => ({ numberOfCounters, counters, total }),
    };
}

export const Host = makeJayComponent(render, HostConstructor);
