import { JayElement } from 'jay-runtime';
import { render, ViewState } from './counter.jay';
import { events } from './ElementEvents';

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

    let element = render(
        { count },
        {
            dec: events().onclick(() => dec()),
            inc: events().onclick(() => inc()),
        },
    );

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({ count });
    };

    return {
        dom: element.dom,
        update: update,
    };
}
