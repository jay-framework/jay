/**
 * Vendor Adapters Module
 *
 * This module provides the infrastructure for pluggable vendor adapters
 * that convert external design editor formats to Jay.
 */

export * from './types';
export * from './figma/figma-adapter';
export * from './figma/types';

import { VendorAdapterRegistry } from './types';
import { FigmaAdapter } from './figma/figma-adapter';

/**
 * Create and initialize the global vendor adapter registry
 * with all available adapters
 */
export function createVendorRegistry(): VendorAdapterRegistry {
    const registry = new VendorAdapterRegistry();

    // Register built-in adapters
    registry.register(new FigmaAdapter());

    // Add more adapters here as they are implemented:
    // registry.register(new WixAdapter());
    // registry.register(new PenpotAdapter());

    return registry;
}
