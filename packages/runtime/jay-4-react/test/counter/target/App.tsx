import * as React from 'react';
import { Counter } from './counter';
import {jay2React} from "../../../lib";

const ReactCounter = jay2React(Counter);

interface AppProps {
    onCounterChange: (message: string) => void
}

export default function App({onCounterChange}: AppProps) {
    return (
        <div>
            <ReactCounter initialValue={12} onChange={newValue => {
                onCounterChange(`counter new value: ${newValue}`)
            }}/>
        </div>
    );
}
