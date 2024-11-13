// @ts-expect-error Cannot find module
import { render, CounterElementRefs } from './counter.jay-html?jay-mainSandbox';
import { makeJayComponentBridge } from 'jay-secure';
export interface CounterProps {
    initialValue: number;
    incrementBy: number;
}
export const Counter = makeJayComponentBridge(render);
