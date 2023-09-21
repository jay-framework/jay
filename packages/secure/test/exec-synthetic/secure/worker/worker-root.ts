import { Comp, CompProps } from './comp';
import { compRef, sandboxRoot } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, CompProps, any, any, any>(Comp, (vs) => ({}), compRef('comp1')),
    ]);
}
