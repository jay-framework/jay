import * as React from 'react';
import { eventsFor, JayReactElementEvents, JayReactEvents } from '../../lib';
import { Jay4ReactElementProps } from '../../lib';
import { HTMLElementCollectionProxy, HTMLElementProxy } from 'jay-runtime';

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

export interface CartElementEvents extends JayReactEvents {
    checkout: JayReactElementEvents;
    removeItem: JayReactElementEvents;
    continueShopping: JayReactElementEvents;
}

export interface CartElementProps
    extends Jay4ReactElementProps<CartElementViewState, CartElementEvents> {}

export function CartElement({ viewState, events, eventsWrapper }: CartElementProps) {
    const { lineItems, minimumOrderReached, total } = viewState;
    const { checkout, removeItem, continueShopping } = events;
    return (
        <div>
            <h2>Shopping Cart</h2>
            {lineItems.map((lineItem) => (
                <div key={lineItem.id} role={'lineItem-' + lineItem.id}>
                    {lineItem.name}, quantity:
                    <span>{lineItem.quantity}, </span>
                    price:
                    <span>{lineItem.price}, </span>
                    <button
                        role={'removeItem-' + lineItem.id}
                        {...eventsFor(
                            ['removeItem', lineItem.id],
                            lineItem,
                            removeItem,
                            eventsWrapper,
                        )}
                    >
                        x
                    </button>
                </div>
            ))}
            {minimumOrderReached ? (
                <div role="condition">minimum order price reached</div>
            ) : (
                <div role="condition">
                    minimum order value not reached
                    <button
                        role="continueShopping"
                        {...eventsFor(
                            ['continueShopping'],
                            viewState,
                            continueShopping,
                            eventsWrapper,
                        )}
                    >
                        x
                    </button>
                </div>
            )}
            <div role="total">Total: {total}</div>
            <button
                role="checkout"
                {...eventsFor(['checkout'], viewState, checkout, eventsWrapper)}
            >
                x
            </button>
        </div>
    );
}
