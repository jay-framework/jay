/**
 * Service and action initialization for the fake-shop example.
 *
 * This file is loaded by the dev-server on startup and registers
 * all services and actions that the application uses.
 */

import {
    onInit,
    onShutdown,
    registerService,
    registerAction,
} from '@jay-framework/stack-server-runtime';
import { PRODUCTS_DATABASE_SERVICE, createProductsDatabaseService } from './products-database';
import { INVENTORY_SERVICE, createInventoryService } from './inventory-service';

// Import actions for registration
import {
    addToCart,
    getCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
} from './actions/cart.actions';
import {
    searchProducts,
    getProductBySlug,
    getAllProducts,
} from './actions/search.actions';

onInit(async () => {
    console.log('[Fake Shop] Initializing services...');

    // Initialize products database service
    const productsDb = createProductsDatabaseService();
    registerService(PRODUCTS_DATABASE_SERVICE, productsDb);

    // Initialize inventory service
    const inventory = createInventoryService();
    registerService(INVENTORY_SERVICE, inventory);

    console.log('[Fake Shop] Services initialized!');

    // Register actions
    console.log('[Fake Shop] Registering actions...');

    // Cart actions
    registerAction(addToCart);
    registerAction(getCart);
    registerAction(removeFromCart);
    registerAction(updateCartQuantity);
    registerAction(clearCart);

    // Search/product actions
    registerAction(searchProducts);
    registerAction(getProductBySlug);
    registerAction(getAllProducts);

    console.log('[Fake Shop] Actions registered!');
});

onShutdown(async () => {
    console.log('[Fake Shop] Shutting down services...');

    // Services are simple in-memory services, no cleanup needed
    // In a real app, you would close database connections, etc.

    console.log('[Fake Shop] Services shut down successfully');
});
