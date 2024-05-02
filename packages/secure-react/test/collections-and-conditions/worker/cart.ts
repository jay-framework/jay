import { CartElementRefs, CartLineItem, render } from './cart.jay-html';
import { makeJayComponent, Props, createState, createEvent, createMemo } from 'jay-component';

export interface CartProps {
    lineItems: CartLineItem[];
    total: number;
    minimumOrder: number;
}

function CartConstructor(
    { lineItems, total, minimumOrder }: Props<CartProps>,
    refs: CartElementRefs,
) {
    let minimumOrderReached = createMemo(() => total() > minimumOrder());

    refs.removeItem.onclick(() => {});
    refs.checkout.onclick(() => {});
    refs.continueShopping.onclick(() => {});
    return {
        render: () => ({ lineItems, total, minimumOrderReached }),
    };
}

export const Cart = makeJayComponent(render, CartConstructor);
