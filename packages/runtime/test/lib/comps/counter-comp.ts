import { dynamicText as dt, element as e } from '../../../lib/element';
import {Coordinate, JayElement, JayEventHandler, ReferencesManager} from '../../../lib';
import { HTMLElementProxy } from '../../../lib';
import { mkComponentEventHandler } from './make-component-event-handler';
import { ConstructContext } from '../../../lib/context';

export interface ViewState {
    count: number;
}

interface CounterRefs {
    inc: HTMLElementProxy<ViewState, HTMLElement>;
    dec: HTMLElementProxy<ViewState, HTMLElement>;
    count: HTMLElementProxy<ViewState, HTMLElement>;
}

export interface CounterElement extends JayElement<ViewState, CounterRefs> {}

function renderCounter(viewState: ViewState): CounterElement {
    let [refManager, [dec, inc, countRef]] =
        ReferencesManager.for({}, ['dec', 'inc', 'count'], [], [], []);
    return ConstructContext.withRootContext(viewState, refManager, () => {
        return e('div', {}, [
            e('div', {}, ['-'], dec()),
            e('div', {}, [dt((vs) => vs.count)], countRef()),
            e('div', {}, ['+'], inc()),
        ])},
    ) as CounterElement;
}

export interface CounterData {
    count: number;
}

export interface CounterEvent {
    count: number;
    innerCoordinate: Coordinate;
}

export function Counter<ParentVS>(initialValue: number) {
    let jayElement = renderCounter({ count: initialValue });
    let count = initialValue;
    let onChange = mkComponentEventHandler<CounterEvent, ParentVS>();

    jayElement.refs.inc.onclick(({ coordinate }) => {
        count += 1;
        jayElement.update({ count });
        onChange.emit({ count, innerCoordinate: coordinate });
        // if (onChange)
        //     onChange({count}, coordinate)
    });

    jayElement.refs.dec.onclick(({ coordinate }) => {
        count -= 1;
        jayElement.update({ count });
        onChange.emit({ count, innerCoordinate: coordinate });
        // if (onChange)
        //     onChange({count}, coordinate)
    });

    let reset = () => {
        count = 0;
        jayElement.update({ count });
        onChange.emit({ count, innerCoordinate: [] });
    };

    return {
        element: jayElement,
        update: (value) => {
            count = value.count;
            jayElement.update({ count });
        },
        mount: () => jayElement.mount(),
        unmount: () => jayElement.unmount(),
        addEventListener: (
            type: string,
            handler: JayEventHandler<any, any, any>,
            options?: boolean | AddEventListenerOptions,
        ) => {},
        removeEventListener: (
            type: string,
            handler: JayEventHandler<any, any, any>,
            options?: EventListenerOptions | boolean,
        ) => {},
        onChange,
        reset,
    };
}
