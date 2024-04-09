import * as React from "react";
import {CounterElement} from "./counter-element.tsx";
import {useState} from "react";

export interface CounterProps {
    initialCount: number;
}

export function Counter({initialCount}: CounterProps) {

    let [count, setCount] = useState(initialCount);

    const subtracter = () => setCount(count-1)
    const adder = () => setCount(count+1)

    return (<CounterElement count={count} subtracter={subtracter} adder={adder}/>)
}