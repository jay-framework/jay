import { Basic, BasicProps } from './basic';
import { sandboxRoot } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';
import { compRef } from '../../../../lib';

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, BasicProps, any, any, any>(
            Basic,
            (vs) => ({ safe: '', firstName: vs.firstName, lastName: vs.lastName }),
            compRef('comp1'),
        ),
    ]);
}
