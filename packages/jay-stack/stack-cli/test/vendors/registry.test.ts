import { describe, it, expect } from 'vitest';
import { getVendor, hasVendor, getRegisteredVendors } from '../../lib/vendors/registry';

describe('Vendor Registry', () => {
    describe('getVendor', () => {
        it('should return figma vendor', () => {
            const vendor = getVendor('figma');
            expect(vendor).toBeDefined();
            expect(vendor?.vendorId).toBe('figma');
        });

        it('should return undefined for unknown vendor', () => {
            const vendor = getVendor('unknown');
            expect(vendor).toBeUndefined();
        });

        it('should return vendor with convertToBodyHtml function', () => {
            const vendor = getVendor('figma');
            expect(vendor).toBeDefined();
            expect(typeof vendor?.convertToBodyHtml).toBe('function');
        });
    });

    describe('hasVendor', () => {
        it('should return true for figma vendor', () => {
            expect(hasVendor('figma')).toBe(true);
        });

        it('should return false for unknown vendor', () => {
            expect(hasVendor('unknown')).toBe(false);
        });

        it('should return false for empty string', () => {
            expect(hasVendor('')).toBe(false);
        });

        it('should be case sensitive', () => {
            expect(hasVendor('Figma')).toBe(false);
            expect(hasVendor('FIGMA')).toBe(false);
        });
    });

    describe('getRegisteredVendors', () => {
        it('should return array of vendor IDs', () => {
            const vendors = getRegisteredVendors();
            expect(vendors).toBeInstanceOf(Array);
            expect(vendors).toContain('figma');
        });

        it('should return at least one vendor', () => {
            const vendors = getRegisteredVendors();
            expect(vendors.length).toBeGreaterThan(0);
        });

        it('should return unique vendor IDs', () => {
            const vendors = getRegisteredVendors();
            const uniqueVendors = [...new Set(vendors)];
            expect(vendors.length).toBe(uniqueVendors.length);
        });

        it('should return non-empty strings', () => {
            const vendors = getRegisteredVendors();
            for (const vendorId of vendors) {
                expect(typeof vendorId).toBe('string');
                expect(vendorId.length).toBeGreaterThan(0);
            }
        });
    });
});
