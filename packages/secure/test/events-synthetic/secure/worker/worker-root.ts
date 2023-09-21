import { Comp, CompProps } from './comp';
import { sandboxRoot } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';
import { compRef } from '../../../../lib';

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, CompProps, any, any, any>(Comp, (vs) => ({}), compRef('comp1')),
    ]);
}
