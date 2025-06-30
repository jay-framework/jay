// @ts-expect-error Cannot find module
import { render } from './counter.jay-html?jay-mainSandbox';
import { makeJayComponentBridge } from '@jay-framework/secure';
export interface CounterProps {
    initialValue: number;
}
export const Counter = makeJayComponentBridge(render);
