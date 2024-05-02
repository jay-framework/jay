import { Cart } from './cart';
import { sandboxRoot } from 'jay-secure';
import { sandboxChildComp } from 'jay-secure';
import { compRef } from 'jay-secure';

export function initializeWorker() {
    sandboxRoot(() => {
        return [sandboxChildComp(Cart, (vs) => vs, compRef('comp1'))];
    });
}
