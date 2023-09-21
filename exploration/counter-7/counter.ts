import { JayElement } from 'jay-runtime';
import { render, ViewState, eventsFor } from './counter.jay';

export function Counter(initial: number): JayElement<ViewState> {
    let count = initial;

    function inc() {
        count += 1;
        element.update({ count });
    }

    function dec() {
        count -= 1;
        element.update({ count });
    }

    let element = render({ count }, [
        eventsFor('dec').on('click', () => dec()),
        eventsFor('inc').on('click', () => inc()),
    ]);

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({ count });
    };

    return {
        dom: element.dom,
        update: update,
    };
}
