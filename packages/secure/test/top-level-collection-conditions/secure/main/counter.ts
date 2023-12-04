import { render } from './counter.jay-html';
import { makeJayComponentBridge } from '../../../../lib/';

export interface CounterProps {
    title: string;
    initialCount: number;
    id: string;
}

export const Counter = makeJayComponentBridge(render, {
    events: ['onChange'],
    functions: ['counterDescription'],
});
