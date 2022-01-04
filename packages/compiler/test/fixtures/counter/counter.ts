import {CounterRefs, render} from './generated';
// @ts-ignore
import {createEvent, createState, makeJayComponent, Props} from 'jay-component';

interface CounterProps {
  initialValue
}

function CounterComponent({initialValue}: Props<CounterProps>, refs: CounterRefs) {
  let [count, setCount] = createState(initialValue);
  refs.adderButton.onclick = () => setCount(count() + 1);
  refs.subtracter.onclick = () => setCount(count() - 1);
  let onChange = createEvent<number>(emitter => emitter.emit(count()))
  return {
    render: () => ({count}),
    onChange
  }
}

export const Counter = makeJayComponent(render, CounterComponent)
