import React, {useEffect, useState} from 'react';
import benchmark from "./benchmark";
import {Table} from "./table";


interface TableHostProps {
    cycles: number,
    running: boolean,
    progressCallback: (string, boolean) => void,
}

export function TableHost({cycles, running, progressCallback}: TableHostProps) {
    let [size, setSize] = useState(100);
    let [updates, setUpdates] = useState(100);
    let [runningIndex, setRunningIndex] = useState(0);

    useEffect(() => {
        if (running) {
            benchmark(index => {
                setRunningIndex(index)
            }, cycles, progressCallback);
        }
        }, [running]
    )

    return (
        <div>
            <div>
                <label htmlFor="size">Size of the table to generate: </label>
                <input id="size" value={size} onInput={_ => setSize(Number((_.target as HTMLInputElement).value))}/>
            </div>
            <div>
                <label htmlFor="updates">Number of updates at each cycle: </label>
                <input id="updates" value={updates} onInput={_ => setUpdates(Number((_.target as HTMLInputElement).value))}/>
            </div>
            <Table tableSize={size} numCellsToUpdate={updates} runningIndex={runningIndex}/>
        </div>)
}