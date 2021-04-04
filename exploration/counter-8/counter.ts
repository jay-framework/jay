import {JayElement} from "jay-runtime";
import {render, ViewState} from './counter.jay';
import {EventEmitter} from "./EventEmitter";

interface CounterType {
    onInc(listener: (count) => void);
    onDec(listener: (count) => void);
}

export function Counter(initial: number): JayElement<ViewState> & CounterType{
    let count = initial;
    let element = render({count});
    let incEvent = new EventEmitter<number>();
    let decEvent = new EventEmitter<number>();

    function inc() {
        count += 1;
        element.update({count});
        incEvent.emit(count);
    }

    function dec() {
        count -= 1;
        element.update({count});
        decEvent.emit(count);
    }

    element.onDec(_ => dec())
    element.onInc(_ => inc())

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({count})
    }

    return {
        dom: element.dom,
        update: update,
        onInc: incEvent.on,
        onDec: decEvent.on
    }
}
