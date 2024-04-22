import * as React from "react";
import {CounterElement, CounterElementViewState} from "./counter-element.tsx";
import {useState} from "react";
import {ComponentBridge} from "../../../../lib/main-bridge.tsx";

export interface CounterProps {
    initialCount: number;
}

export function Counter({initialCount}: CounterProps) {

    let [count, setCount] = useState(initialCount);

    const subtracter = () => setCount(count-1)
    const adder = () => setCount(count+1)

    return (<CounterElement viewState={{count}} events={{subtracter, adder}}/>)
}

export const CounterBridge =
    ComponentBridge<CounterElementViewState, CounterProps>(CounterElement);