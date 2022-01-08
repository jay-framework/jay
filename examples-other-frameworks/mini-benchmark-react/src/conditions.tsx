import React, {useEffect, useState} from 'react';
import benchmark from "./benchmark";


interface ConditionsProps {
    cycles: number,
    running: boolean,
    progressCallback: (string, boolean) => void,
}

export function Conditions({cycles, running, progressCallback}: ConditionsProps) {
    let [text, setText] = useState('name')
    let [text2, setText2] = useState('text 2')
    let [cond, setCond] = useState(false)

    useEffect(() => {
        if (running) {
            benchmark(index => {
                setText('name A ' + index)
                setText2('name B ' + index*2)
                setCond(index % 2 === 0)
            }, cycles, progressCallback);
        }
        }, [running]
    )

    return (
        <div>
            {cond && (<div style={{color:"red"}}>{text}</div>)}
            {!cond && (<div style={{color:"green"}}>{text2}</div>)}
        </div>
)
}