// @ts-expect-error Cannot find module
import { render as BasicRender } from './counter.jay-html?jay-mainSandbox';
import { makeJayComponentBridge } from 'jay-secure';
export interface CounterProps {
    initialValue: number;
}
export const Counter = makeJayComponentBridge(BasicRender);
