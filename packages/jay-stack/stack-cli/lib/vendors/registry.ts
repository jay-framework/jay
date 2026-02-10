import { Vendor } from './types';

// Import all vendor implementations
// Vendors contribute their implementations to this file
import { figmaVendor } from './figma';

/**
 * Vendor registry - maps vendorId to Vendor instance
 *
 * To add a new vendor:
 * 1. Create a folder under vendors/ with the vendor ID (e.g., 'figma')
 * 2. Implement the Vendor interface in index.ts
 * 3. Import it above
 * 4. Add it to the vendorRegistry below
 */
const vendorRegistry = new Map<string, Vendor>([
    [figmaVendor.vendorId, figmaVendor],
    // Add more vendors here as they are contributed
]);

/**
 * Get a vendor by ID
 *
 * @param vendorId - The vendor ID
 * @returns The vendor or undefined if not found
 */
export function getVendor(vendorId: string): Vendor | undefined {
    return vendorRegistry.get(vendorId);
}

/**
 * Check if a vendor exists
 *
 * @param vendorId - The vendor ID
 * @returns True if vendor exists
 */
export function hasVendor(vendorId: string): boolean {
    return vendorRegistry.has(vendorId);
}

/**
 * Get all registered vendor IDs
 *
 * @returns Array of vendor IDs
 */
export function getRegisteredVendors(): string[] {
    return Array.from(vendorRegistry.keys());
}
