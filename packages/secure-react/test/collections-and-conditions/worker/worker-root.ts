import { Cart } from './cart.ts';
import { sandboxRoot } from 'jay-secure';
import { sandboxChildComp } from 'jay-secure';
import { compRef } from 'jay-secure';

export function initializeWorker() {
    sandboxRoot(() => {
        return [
            sandboxChildComp(
                Cart,
                (vs) => ({
                    lineItems: [],
                    total: 30,
                    minimumOrder: 20
                }),
                compRef('comp1'),
            ),
        ];
    });
}
