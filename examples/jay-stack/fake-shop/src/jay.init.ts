/**
 * Service initialization for the fake-shop example.
 * 
 * This file is loaded by the dev-server on startup and registers
 * all services that pages can use via dependency injection.
 */

import { onInit, onShutdown, registerService, getService } from '@jay-framework/stack-server-runtime';
import { 
    PRODUCTS_DATABASE_SERVICE, 
    createProductsDatabaseService 
} from './products-database';
import { 
    INVENTORY_SERVICE, 
    createInventoryService 
} from './inventory-service';

onInit(async () => {
    console.log('[Fake Shop] Initializing services...');
    
    // Initialize products database service
    const productsDb = createProductsDatabaseService();
    registerService(PRODUCTS_DATABASE_SERVICE, productsDb);
    
    // Initialize inventory service
    const inventory = createInventoryService();
    registerService(INVENTORY_SERVICE, inventory);
    
    console.log('[Fake Shop] Services initialized successfully');
});

onShutdown(async () => {
    console.log('[Fake Shop] Shutting down services...');
    
    // Services are simple in-memory services, no cleanup needed
    // In a real app, you would close database connections, etc.
    
    console.log('[Fake Shop] Services shut down successfully');
});

