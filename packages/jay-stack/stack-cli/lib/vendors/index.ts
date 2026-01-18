/**
 * Vendors Module
 *
 * This module manages vendor-specific converters that transform
 * vendor documents (e.g., Figma, Sketch) to Jay HTML format.
 *
 * Vendors are statically imported and registered at initialization.
 */

export type { Vendor } from './types';
export { getVendor, hasVendor, getRegisteredVendors } from './registry';
