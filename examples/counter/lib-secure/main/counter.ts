import { render } from './counter.jay.html';
import { makeJayComponentBridge } from 'jay-secure';

export interface CounterProps {
    initialValue: number;
}

export const Counter = makeJayComponentBridge(render);
