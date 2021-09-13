import {ConstructContext, dynamicText as dt, element as e, JayComponent, JayElement} from "../../../lib/element";

interface ViewState {
    count: number
}

interface CounterElement extends JayElement<ViewState> {
    inc: HTMLElement,
    dec: HTMLElement,
    count: HTMLElement
}

function renderCounter(viewState: ViewState): CounterElement {

    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
                e('div', {ref: 'dec'}, ['-']),
                e('div', {ref: 'count'}, [dt(vs => vs.count)]),
                e('div', {ref: 'inc'}, ['+'])])
    ) as CounterElement;
}

interface CounterData {
    count: number
}

interface CounterComponent extends JayComponent<CounterData, ViewState, CounterElement> {

}

export function Counter(initialValue: number): CounterComponent {
    let jayElement = renderCounter({count: initialValue});
    let count = initialValue;

    jayElement.inc.onclick = () => {
        count += 1;
        jayElement.update({count});
    }

    jayElement.dec.onclick = () => {
        count -= 1;
        jayElement.update({count});
    }

    return {
        element: jayElement,
        update: (value) => {
            count = value.count;
            jayElement.update({count});
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount()
    }
}