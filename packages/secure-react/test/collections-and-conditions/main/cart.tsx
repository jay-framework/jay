import {CartElement, CartElementProps, CartElementViewState, CartLineItem} from "./cart-element.tsx";
import {ComponentBridge} from "../../../lib/main-bridge";

export interface CartProps {
    lineItems: CartLineItem[],
    total: number
    minimumOrder: number
}

export const CartBridge =
    ComponentBridge<CartElementViewState, CartProps, CartElementProps>(CartElement);