import { render } from './comp.jay-html';
import { FunctionsRepository, makeJayComponentBridge } from '../../../../lib';

export interface CompProps {}

export const funcRepository: FunctionsRepository = {
    '1': ({ event: Event }) => (event.target as HTMLInputElement).value,
    '2': ({ event: Event }) => (event.target as HTMLInputElement).value,
};

export const Comp = makeJayComponentBridge(render, { funcRepository });
