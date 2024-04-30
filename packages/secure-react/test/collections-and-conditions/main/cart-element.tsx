import * as React from "react";
import {JayReactElementEvents, JayReactEvents} from '../../../lib/main-bridge';
import {createElementFromJay as el} from '../../../lib/main-element-events';

export interface CartLineItem {
    id: string,
    name: string,
    quantity: number,
    price: number
}

export interface CartElementViewState {
    lineItems: CartLineItem[],
    minimumOrderReached: boolean,
    total: number
}

export interface CartElementEvents extends JayReactEvents {
    checkout: JayReactElementEvents
    removeItem: JayReactElementEvents
    continueShopping: JayReactElementEvents
}

export interface CartElementProps {
    viewState: CartElementViewState,
    events: CartElementEvents;
}

export function CartElement({viewState, events: {checkout, removeItem, continueShopping}}: CartElementProps) {
    const {lineItems, minimumOrderReached, total} = viewState;
    return (<div>
            <h2>Shopping Cart</h2>
            {lineItems.map(lineItem => (
                <div key={lineItem.id}>{lineItem.name}
                    <span>{lineItem.quantity}</span>
                    <span>{lineItem.price}</span>
                    {el('button', viewState, ['removeItem', lineItem.id], {role: 'removeItem'}, removeItem, ['x'])}
                </div>
            ))}
            {minimumOrderReached?
                (<div role="condition">minimum order price reached</div>):
                (<div role="condition">minimum order value not reached
                    {el('button', viewState, ['continueShopping'], {role: 'continueShopping'}, continueShopping, ['continue shopping'])}
                </div>)}
            {el('button', viewState, ['checkout'], {role: 'checkout'}, checkout, ['checkout'])}
        </div>
    )
}