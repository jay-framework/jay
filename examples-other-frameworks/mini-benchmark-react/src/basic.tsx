import React, { useEffect, useState } from 'react';
import benchmark from './benchmark';

interface BasicProps {
    cycles: number;
    running: boolean;
    progressCallback: (string, boolean) => void;
}

export function Basic({ cycles, running, progressCallback }: BasicProps) {
    let [text, setText] = useState('name');

    useEffect(() => {
        if (running) {
            benchmark(
                (index) => {
                    setText('name ' + index);
                },
                cycles,
                progressCallback,
            );
        }
    }, [running]);

    return (
        <div>
            <div>{text}</div>
        </div>
    );
}
