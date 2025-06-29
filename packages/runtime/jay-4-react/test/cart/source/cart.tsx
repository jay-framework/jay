import { render, CartElementRefs, CartLineItem } from './cart.jay-html';
import { Props, createEvent, createMemo, makeJayComponent } from '@jay-framework/component';

export interface CartProps {
    lineItems: CartLineItem[];
    total: number;
    minimumOrder: number;
}

export interface CartRemoveItemEvent {
    itemId: string;
}

export interface CartEvent {
    type: 'checkout' | 'continueShopping';
}

function CartConstructor(
    { lineItems, total, minimumOrder }: Props<CartProps>,
    refs: CartElementRefs,
) {
    let minimumOrderReached = createMemo(() => total() > minimumOrder());
    let onRemoveItem = createEvent<CartRemoveItemEvent>();
    let onCartEvent = createEvent<CartEvent>();

    refs.removeItem.onclick(({ coordinate }) => {
        onRemoveItem.emit({ itemId: coordinate[0] });
    });
    refs.checkout.onclick(() => onCartEvent.emit({ type: 'checkout' }));
    refs.continueShopping.onclick(() => onCartEvent.emit({ type: 'continueShopping' }));
    return {
        render: () => ({ lineItems, total, minimumOrderReached }),
        onRemoveItem,
        onCartEvent,
    };
}

export const Cart = makeJayComponent(render, CartConstructor);
