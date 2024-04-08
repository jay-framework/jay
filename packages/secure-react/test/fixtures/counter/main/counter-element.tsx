import * as React from "react";

export interface CounterProps {
    count: number
    subtracter: () => void;
    adder: () => void
}

export function CounterElement({count, subtracter, adder}: CounterProps) {
    return (<div>
            <button onClick={subtracter}>-</button>
            <span style={{margin: "0 16px"}}>{count}</span>
            <button onClick={adder}>+</button>
        </div>
    )
}