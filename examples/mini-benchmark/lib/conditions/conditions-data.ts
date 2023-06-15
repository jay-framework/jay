import {render, ConditionsElementRefs} from './conditions.jay.html';
import {createState, makeJayComponent, useReactive, Props } from 'jay-component';
import benchmark from "../benchmark";

interface ConditionsProps {
    cycles: number
}

function ConditionsConstructor({cycles}: Props<ConditionsProps>, refs: ConditionsElementRefs) {
    let [text1, setText1] = createState('name');
    let [text2, setText2] = createState('text 2');
    let [cond, setCond] = createState(true)
    let reactive = useReactive();

    const makeData = (index) => {
        setText1('name A ' + index)
        setText2('name B ' + index*2)
        setCond(index % 2 === 0)
    }

    const run = (progressCallback: (string) => void) => {
        benchmark(index => reactive.batchReactions(() => makeData(index)), cycles(), progressCallback);
    }
    return {
        render: () => ({text1, text2, cond}),
        run
    }
}

export const Conditions = makeJayComponent(render, ConditionsConstructor);