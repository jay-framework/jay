// @ts-expect-error Cannot find module
import { render } from './auto-counter.jay-html?jay-mainSandbox';
import { makeJayComponentBridge } from 'jay-secure';
export interface AutoCounterProps {
    initialValue: number;
}
export const AutoCounter = makeJayComponentBridge(render);
