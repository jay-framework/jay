import * as React from "react";

export interface CounterProps {
    count: number
    subtracter: () => void;
    adder: () => void
}

export function CounterElement({count, subtracter, adder}: CounterProps) {
    return (<div>
            <button role="sub" onClick={subtracter}>-</button>
            <span role="value" style={{margin: "0 16px"}}>{count}</span>
            <button role="add" onClick={adder}>+</button>
        </div>
    )
}