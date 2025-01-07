import * as React from 'react';
import {Counter , Counter2} from './counter';
import {jay2React, jay2React2} from '../../../lib';

const ReactCounter = jay2React(Counter);
const ReactCounter2 = jay2React2(() => Counter2);

interface AppProps {
    onCounterChange: (message: string) => void;
}

export default function App({ onCounterChange }: AppProps) {
    return (
        <div>
            <ReactCounter2
                initialValue={12}
                onChange={(newValue) => {
                    onCounterChange(`counter new value: ${newValue}`);
                }}
            />
        </div>
    );
}
