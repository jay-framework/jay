import { JayElement } from 'jay-runtime';
import { render, ViewState } from './counter.jay';

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

    function bindEvents(id: string, elem) {
        if (id === 'dec') elem.addEventListener('click', (_) => dec());
        else if (id === 'inc') elem.addEventListener('click', (_) => inc());
    }

    let element = render({ count }, bindEvents);

    let update = (viewState: ViewState) => {
        count = viewState.count;
        element.update({ count });
    };

    return {
        dom: element.dom,
        update: update,
    };
}
