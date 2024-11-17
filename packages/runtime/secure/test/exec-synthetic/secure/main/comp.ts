import { render } from './comp.jay-html';
import { makeJayComponentBridge } from '../../../../lib';
import { FunctionsRepository } from '../../../../lib';

export interface CompProps {}

export const funcRepository: FunctionsRepository = {
    '1': (elem, viewState) => {
        return elem.innerHTML;
    },
    '3': (elem, viewState) => {
        return elem.innerHTML;
    },
};

export const Comp = makeJayComponentBridge(render, { funcRepository });
