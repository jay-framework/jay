import { Counter, CounterProps } from './counter';
import { sandboxRoot } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';
import { compRef } from '../../../../lib';

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, CounterProps, any, any, any>(
            Counter,
            (vs) => ({ title: 'first counter', initialCount: 12 }),
            compRef('a'),
        ),
    ]);
}
