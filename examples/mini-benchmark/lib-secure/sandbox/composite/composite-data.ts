import {render, CompositeElementRefs} from './composite.jay.html';
import {createState, makeJayComponent, useReactive, Props } from 'jay-component';
import benchmark from "../benchmark";

interface CompositeProps {
    cycles: number
}

function CompositeConstructor({cycles}: Props<CompositeProps>, refs: CompositeElementRefs) {
    let [text, setText] = createState('name');
    let [text2, setText2] = createState('text 2');
    let reactive = useReactive();

    const makeData = (index) => {
        setText('name ' + index)
        setText2('text 2 ' + index)
    }

    const run = (progressCallback: (string) => void) => {
        benchmark(index => reactive.batchReactions(() => makeData(index)), cycles(), progressCallback);
    }
    return {
        render: () => ({text, text2}),
        run
    }
}

export const Composite = makeJayComponent(render, CompositeConstructor);