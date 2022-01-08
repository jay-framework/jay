import React, {useEffect, useState} from 'react';
import benchmark from "./benchmark";


interface CompositeProps {
    cycles: number,
    running: boolean,
    progressCallback: (string, boolean) => void,
}

export function Composite({cycles, running, progressCallback}: CompositeProps) {
    let [text, setText] = useState('name')
    let [text2, setText2] = useState('text 2')

    useEffect(() => {
        if (running) {
            benchmark(index => {
                setText('name ' + index)
                setText2('text 2 ' + index)
            }, cycles, progressCallback);
        }
        }, [running]
    )

    return (
        <div>
            <div>{text}</div>
            <div>static</div>
            <div>{text2}</div>
        </div>)
}