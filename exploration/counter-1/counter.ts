import {JayElement} from "jay-runtime";
import {render, ViewState} from './counter.jay';

export function Counter(initial: number): JayElement<ViewState> {
    let count = initial;
    let element = render({count});

    function inc() {
        count += 1;
        element.update({count});
    }

    function dec() {
        count -= 1;
        element.update({count});
    }

    element.events.onDec(_ => dec())
    element.events.onInc(_ => inc())

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({count})
    }

    return {
        dom: element.dom,
        update: update
    }
}