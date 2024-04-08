import { Counter } from './counter';
import { sandboxRoot } from 'jay-secure';
import { sandboxChildComp } from 'jay-secure';
import { compRef } from 'jay-secure';

export function initializeWorker() {
    sandboxRoot(() => {
        return [
            sandboxChildComp(
                Counter,
                (vs) => ({
                    initialCount: vs.initialCount,
                }),
                compRef('comp1'),
            ),
        ];
    });
}
