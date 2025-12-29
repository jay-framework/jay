/**
 * Service initialization for the fake-shop example.
 *
 * This file is loaded by the dev-server on startup and registers
 * all services that the application uses.
 *
 * Note: Actions are auto-discovered and registered from src/actions/
 * by the dev-server, so no manual registerAction() calls are needed.
 */

import {
    onInit,
    onShutdown,
    registerService,
} from '@jay-framework/stack-server-runtime';
import { PRODUCTS_DATABASE_SERVICE, createProductsDatabaseService } from './products-database';
import { INVENTORY_SERVICE, createInventoryService } from './inventory-service';

onInit(async () => {
    console.log('[Fake Shop] Initializing services...');

    // Initialize products database service
    const productsDb = createProductsDatabaseService();
    registerService(PRODUCTS_DATABASE_SERVICE, productsDb);

    // Initialize inventory service
    const inventory = createInventoryService();
    registerService(INVENTORY_SERVICE, inventory);

    console.log('[Fake Shop] Services initialized!');

    // Actions are auto-discovered from src/actions/*.actions.ts
    // No manual registration needed!
});

onShutdown(async () => {
    console.log('[Fake Shop] Shutting down services...');

    // Services are simple in-memory services, no cleanup needed
    // In a real app, you would close database connections, etc.

    console.log('[Fake Shop] Services shut down successfully');
});
