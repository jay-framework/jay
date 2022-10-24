import {ConstructContext, dynamicText as dt, element as e} from "../../../lib/element";
import {JayComponent, JayElement, JayEventHandler} from "../../../lib/element-types";
import {HTMLElementProxy} from "../../../lib/node-reference-types";

interface ViewState {
    count: number
}

interface CounterRefs {
    inc: HTMLElementProxy<ViewState, HTMLElement>,
    dec: HTMLElementProxy<ViewState, HTMLElement>,
    count: HTMLElementProxy<ViewState, HTMLElement>
}

interface CounterElement extends JayElement<ViewState, CounterRefs> {}

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
    onChange(handler: (viewState: ViewState, coordinate: string) => void)
}

export function Counter(initialValue: number): CounterComponent {
    let jayElement = renderCounter({count: initialValue});
    let count = initialValue;
    let onChangeHandler: (viewState: ViewState, coordinate: string) => void;

    jayElement.refs.inc.onclick(({viewState, coordinate}) => {
        count += 1;
        jayElement.update({count});
        if (onChangeHandler)
            onChangeHandler({count}, coordinate)
    })

    jayElement.refs.dec.onclick(({viewState, coordinate}) => {
        count -= 1;
        jayElement.update({count});
        if (onChangeHandler)
            onChangeHandler({count}, coordinate)
    })

    return {
        element: jayElement,
        update: (value) => {
            count = value.count;
            jayElement.update({count});
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        addEventListener: (type: string, handler: JayEventHandler<any, any, any>, options?: boolean | AddEventListenerOptions) => {},
        removeEventListener: (type: string, handler: JayEventHandler<any, any, any>, options?: EventListenerOptions | boolean) => {},
        onChange: (handler => onChangeHandler = handler)
    }
}