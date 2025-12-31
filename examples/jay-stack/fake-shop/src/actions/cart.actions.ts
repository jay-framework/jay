/**
 * Cart actions for the fake-shop example.
 *
 * These actions demonstrate how to create server-side actions
 * that can be called from client-side code.
 */

import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { INVENTORY_SERVICE } from '../inventory-service';

// In-memory cart store (in a real app, this would be session-based or database-backed)
interface CartItem {
    productId: string;
    quantity: number;
}

const cart: CartItem[] = [];

/**
 * Add an item to the cart.
 * Validates that the product is in stock before adding.
 */
export const addToCart = makeJayAction('cart.addToCart')
    .withServices(INVENTORY_SERVICE)
    .withHandler(async (
        input: { productId: string; quantity: number },
        inventory,
    ) => {
        // Validate quantity
        if (input.quantity < 1) {
            throw new ActionError('INVALID_QUANTITY', 'Quantity must be at least 1');
        }

        // Check availability
        const available = await inventory.getAvailableUnits(input.productId);
        if (available < input.quantity) {
            throw new ActionError(
                'NOT_AVAILABLE',
                available === 0
                    ? 'Product is out of stock'
                    : `Only ${available} units available`,
            );
        }

        // Add to cart or update quantity
        const existingItem = cart.find((item) => item.productId === input.productId);
        if (existingItem) {
            existingItem.quantity += input.quantity;
        } else {
            cart.push({ productId: input.productId, quantity: input.quantity });
        }

        console.log('Item added to cart, id: ', input.productId, "quantity:", input.quantity);
        return {
            cartItemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
            message: `Added ${input.quantity} item(s) to cart`,
        };
    });

/**
 * Get the current cart contents.
 */
export const getCart = makeJayAction('cart.getCart')
    .withHandler(async (_input: void) => {
        return {
            items: [...cart],
            itemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
        };
    });

/**
 * Remove an item from the cart.
 */
export const removeFromCart = makeJayAction('cart.removeFromCart')
    .withMethod('DELETE')
    .withHandler(async (input: { productId: string }) => {
        const index = cart.findIndex((item) => item.productId === input.productId);
        if (index === -1) {
            throw new ActionError('NOT_IN_CART', 'Item is not in cart');
        }

        cart.splice(index, 1);

        return {
            cartItemCount: cart.reduce((sum, item) => sum + item.quantity, 0),
            message: 'Item removed from cart',
        };
    });

/**
 * Update the quantity of an item in the cart.
 */
export const updateCartQuantity = makeJayAction('cart.updateQuantity')
    .withServices(INVENTORY_SERVICE)
    .withMethod('PATCH')
    .withHandler(async (
        input: { productId: string; quantity: number },
        inventory,
    ) => {
        const item = cart.find((i) => i.productId === input.productId);
        if (!item) {
            throw new ActionError('NOT_IN_CART', 'Item is not in cart');
        }

        if (input.quantity < 1) {
            throw new ActionError('INVALID_QUANTITY', 'Quantity must be at least 1');
        }

        // Check availability for new quantity
        const available = await inventory.getAvailableUnits(input.productId);
        if (available < input.quantity) {
            throw new ActionError(
                'NOT_AVAILABLE',
                `Only ${available} units available`,
            );
        }

        item.quantity = input.quantity;

        return {
            cartItemCount: cart.reduce((sum, i) => sum + i.quantity, 0),
            message: 'Cart updated',
        };
    });

/**
 * Clear the entire cart.
 */
export const clearCart = makeJayAction('cart.clear')
    .withHandler(async (_input: void) => {
        cart.length = 0;
        return { success: true, message: 'Cart cleared' };
    });