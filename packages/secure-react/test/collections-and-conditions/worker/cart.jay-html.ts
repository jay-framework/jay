import { HTMLElementCollectionProxy, HTMLElementProxy, JayElement } from 'jay-runtime';
import { compCollectionRef, elementBridge } from 'jay-secure';
import { sandboxElement as e, sandboxCondition, sandboxForEach } from 'jay-secure';
import { elemRef } from 'jay-secure';

export interface CartLineItem {
    id: string;
    name: string;
    quantity: number;
    price: number;
}

export interface CartElementViewState {
    lineItems: CartLineItem[];
    minimumOrderReached: boolean;
    total: number;
}

export interface CartElementRefs {
    checkout: HTMLElementProxy<CartElementViewState, HTMLButtonElement>;
    removeItem: HTMLElementCollectionProxy<CartElementViewState, HTMLButtonElement>;
    continueShopping: HTMLElementProxy<CartElementViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CartElementViewState, CartElementRefs>;

export function render(viewState: CartElementViewState): CounterElement {
    return elementBridge(viewState, () => {
        const refComp1 = compCollectionRef('removeItem');
        return [
            sandboxCondition(
                (viewState) => viewState.minimumOrderReached,
                [e(elemRef('continueShopping'))],
            ),
            sandboxForEach(
                (viewState) => viewState.lineItems,
                'id',
                () => [e(refComp1())],
            ),
            e(elemRef('checkout')),
        ];
    }) as unknown as CounterElement;
}
