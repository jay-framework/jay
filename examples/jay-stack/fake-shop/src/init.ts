/**
 * Consolidated initialization for the fake-shop example.
 *
 * Uses the makeJayInit pattern to define both server and client
 * initialization in a single file.
 */

import { makeJayInit } from '@jay-framework/fullstack-component';
import { registerService, onShutdown } from '@jay-framework/stack-server-runtime';
import { createJayContext, registerGlobalContext } from '@jay-framework/runtime';
import { PRODUCTS_DATABASE_SERVICE, createProductsDatabaseService } from './products-database';
import { INVENTORY_SERVICE, createInventoryService } from './inventory-service';

// ============================================================================
// Type Definitions (shared between server and client)
// ============================================================================

/**
 * Store configuration available to all components.
 */
export interface StoreConfig {
    storeName: string;
    currency: string;
    currencySymbol: string;
}

/**
 * Feature flags available to all components.
 */
export interface FeatureFlags {
    enableWishlist: boolean;
    enableProductComparison: boolean;
    showOutOfStockProducts: boolean;
}

/**
 * UI settings available to all components.
 */
export interface UISettings {
    itemsPerPage: number;
    analyticsEnabled: boolean;
}

/**
 * Complete configuration passed from server to client.
 */
export interface AppConfig {
    store: StoreConfig;
    features: FeatureFlags;
    ui: UISettings;
}

// ============================================================================
// Context Definitions (client-only)
// ============================================================================

export const STORE_CONFIG_CONTEXT = createJayContext<StoreConfig>();
export const FEATURE_FLAGS_CONTEXT = createJayContext<FeatureFlags>();
export const UI_SETTINGS_CONTEXT = createJayContext<UISettings>();

// ============================================================================
// Project Initialization
// ============================================================================

export const init = makeJayInit()
    .withServer(async () => {
        console.log('[Fake Shop] Initializing services...');

        // Initialize products database service
        const productsDb = createProductsDatabaseService();
        registerService(PRODUCTS_DATABASE_SERVICE, productsDb);

        // Initialize inventory service
        const inventory = createInventoryService();
        registerService(INVENTORY_SERVICE, inventory);

        // Register shutdown callback
        onShutdown(async () => {
            console.log('[Fake Shop] Shutting down services...');
            // Services are simple in-memory services, no cleanup needed
            // In a real app, you would close database connections, etc.
            console.log('[Fake Shop] Services shut down successfully');
        });

        console.log('[Fake Shop] Services initialized!');

        // Return configuration to pass to client (typed!)
        return {
            store: {
                storeName: 'Fake Shop',
                currency: 'USD',
                currencySymbol: '$',
            },
            features: {
                enableWishlist: true,
                enableProductComparison: false,
                showOutOfStockProducts: true,
            },
            ui: {
                itemsPerPage: 12,
                // @ts-ignore
                analyticsEnabled: process.env.NODE_ENV === 'production',
            },
        };
    })
    .withClient((config) => {
        // config is typed as AppConfig!
        console.log('[Fake Shop] Initializing client-side contexts...');
        console.log('[Fake Shop] Received config from server:', config);

        registerGlobalContext(STORE_CONFIG_CONTEXT, config.store);
        registerGlobalContext(FEATURE_FLAGS_CONTEXT, config.features);
        registerGlobalContext(UI_SETTINGS_CONTEXT, config.ui);

        console.log('[Fake Shop] Client initialization complete');
    });
