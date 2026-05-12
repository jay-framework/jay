import { makeJayAction } from '@jay-framework/fullstack-component';

export const addToCart = makeJayAction('cart.add')
    .withHandler(async (input: { itemId: string; quantity: number }) => {
        return { success: true, itemId: input.itemId, quantity: input.quantity };
    });
