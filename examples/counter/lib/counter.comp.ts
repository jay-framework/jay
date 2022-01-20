import {render, CounterRefs} from './counter.jay.html';
import {createState, makeJayComponent, Props} from 'jay-component';

interface CounterProps {
    initialValue: number
}

function CounterConstructor({initialValue}: Props<CounterProps>, refs: CounterRefs) {

    let [count, setCount] = createState(initialValue);

    refs.subtracter.onclick = () => setCount(count() - 1);
    refs.adder.onclick = () => setCount(count() + 1);

    return {
        render: () => ({count})
    }
}

export const Counter = makeJayComponent(render, CounterConstructor);

export default function run(target) {
    let counter = Counter({initialValue: 12});
    target.innerHTML = '';
    target.appendChild(counter.element.dom);
}