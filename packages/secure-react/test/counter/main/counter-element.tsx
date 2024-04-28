import * as React from "react";
import {JayReactElementEvents, JayReactEvents} from '../../../lib/main-bridge';
import {createElementFromJay as el} from '../../../lib/main-element-events';

export interface CounterElementViewState {
    count: number
}

export interface CounterElementEvents extends JayReactEvents {
    subtracter: JayReactElementEvents;
    adder: JayReactElementEvents
}

export interface CounterElementProps {
    viewState: CounterElementViewState,
    events: CounterElementEvents;
}

export function CounterElement({viewState, events: {subtracter, adder}}: CounterElementProps) {
    const {count} = viewState;
    return (<div>
            {el('button', viewState, ['subtracter'], {role: 'sub'}, subtracter, ['-'])}
            <span role="value" style={{margin: "0 16px"}}>{count}</span>
            {el('button', viewState, ['adder'], {role: 'add'}, adder, ['-'])}
        </div>
    )
}