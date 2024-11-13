import {
    CounterElementRefs,
    render as BasicRender,
// @ts-expect-error Cannot find module
} from './generated-element-main-trusted?jay-mainSandbox';
import { makeJayComponentBridge } from 'jay-secure';
export interface CounterProps {
    initialValue: number;
}
export const Counter = makeJayComponentBridge(BasicRender);
