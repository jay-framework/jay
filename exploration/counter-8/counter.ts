import { JayElement } from 'jay-runtime';
import { render, ViewState } from './counter.jay';
import { EventEmitter } from './EventEmitter';

interface CounterType {
  onChange(listener: (count) => void);
}

export function Counter(initial: number): JayElement<ViewState> & CounterType {
  let count = initial;
  let element = render({ count });
  let changeEvent = new EventEmitter<number>();

  function inc() {
    count += 1;
    element.update({ count });
    changeEvent.emit(count);
  }

  function dec() {
    count -= 1;
    element.update({ count });
    changeEvent.emit(count);
  }

  element.onDec((_) => dec());
  element.onInc((_) => inc());

  let update = (viewState: ViewState) => {
    count = viewState.count;
    element.update({ count });
  };

  return {
    dom: element.dom,
    update: update,
    onChange: changeEvent.on,
  };
}
