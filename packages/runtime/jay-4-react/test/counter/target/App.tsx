import * as React from 'react';
import { Counter } from './counter';
import { jay2React } from '../../../lib';

const ReactCounter2 = jay2React(() => Counter);

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
