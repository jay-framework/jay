import { render } from './counter.jay.html';
import { makeJayComponentBridge } from 'jay-secure';
export interface CounterProps {
    initialValue: number;
    incrementBy: number;
}
export const Counter = makeJayComponentBridge(render);
