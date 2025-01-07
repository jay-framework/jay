import * as React from 'react';
import {eventsFor, mimicJayElement} from '../../../lib';
import { Jay4ReactElementProps } from '../../../lib';
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

export interface CartElementProps extends Jay4ReactElementProps<CartElementViewState> {}

export function render({ vs, context }: CartElementProps) {
    const { lineItems, minimumOrderReached, total } = vs;
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
                        {...eventsFor(context.child(lineItem.id, lineItem), 'removeItem')}
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
                    <button role="continueShopping" {...eventsFor(context, 'continueShopping')}>
                        x
                    </button>
                </div>
            )}
            <div role="total">Total: {total}</div>
            <button role="checkout" {...eventsFor(context, 'checkout')}>
                x
            </button>
        </div>
    );
}

export const render2 = mimicJayElement(render)
