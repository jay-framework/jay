import * as React from "react";
import {JayEventHandler} from "jay-runtime";
import {JayReactElementEvents, JayReactEvents} from '../../../../lib/main-bridge';

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

function jayEventHandlerToReact(viewState: any, coordinate, handler: JayEventHandler<any, any, any>): 
    React.EventHandler<React.SyntheticEvent<any, any>> {
        return handler? 
        (event) => handler({coordinate, event: 'click', viewState})
            :
            undefined;
    }

export function CounterElement({viewState, events: {subtracter, adder}}: CounterElementProps) {
    const {count} = viewState;
    return (<div>
            <button role="sub" onClick={jayEventHandlerToReact(viewState, ['subtracter'], subtracter?.click)}>-</button>
            <span role="value" style={{margin: "0 16px"}}>{count}</span>
            <button role="add" onClick={jayEventHandlerToReact(viewState, ['adder'], adder?.click)}>+</button>
        </div>
    )
}