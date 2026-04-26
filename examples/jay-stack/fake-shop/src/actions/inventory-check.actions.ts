/**
 * Inventory check streaming action for the fake-shop example.
 *
 * Demonstrates makeJayStream: streams stock status for each product
 * one at a time, simulating a batch inventory check.
 */

import { makeJayStream } from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE } from '../products-database';
import { INVENTORY_SERVICE } from '../inventory-service';

export interface InventoryCheckResult {
    productId: string;
    name: string;
    sku: string;
    units: number;
    inStock: boolean;
}

/**
 * Stream inventory status for all products.
 * Each chunk yields one product's stock info, simulating
 * a slow per-product check (e.g. warehouse API calls).
 */
export const checkInventory = makeJayStream('inventory.check')
    .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
    .withHandler(async function* (_input: void, productsDb, inventory) {
        const products = await productsDb.getProducts();
        for (const product of products) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            const units = await inventory.getAvailableUnits(product.id);
            yield {
                productId: product.id,
                name: product.name,
                sku: product.sku,
                units,
                inStock: units > 0,
            } satisfies InventoryCheckResult;
        }
    });
