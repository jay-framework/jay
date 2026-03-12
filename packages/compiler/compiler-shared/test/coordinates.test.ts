import { describe, it, expect } from 'vitest';
import {
    compileCoordinateExpr,
    isStaticCoordinate,
    computeInstanceKey,
    compileForEachInstanceKeyExpr,
    computeForEachInstanceKey,
} from '../lib';

describe('compileCoordinateExpr', () => {
    it('should return quoted string for static coordinates', () => {
        expect(compileCoordinateExpr('product-card:0/0', {})).toBe("'product-card:0/0'");
        expect(compileCoordinateExpr('0', {})).toBe("'0'");
        expect(compileCoordinateExpr('p1/product-card:0/addToCart', {})).toBe(
            "'p1/product-card:0/addToCart'",
        );
    });

    it('should compile single placeholder', () => {
        expect(compileCoordinateExpr('0/$_id/1', { _id: 'vs1._id' })).toBe(
            "'0/' + escapeAttr(String(vs1._id)) + '/1'",
        );
    });

    it('should compile placeholder at start', () => {
        expect(compileCoordinateExpr('$_id/product-card:0/0', { _id: 'vs1._id' })).toBe(
            "escapeAttr(String(vs1._id)) + '/product-card:0/0'",
        );
    });

    it('should compile placeholder at end', () => {
        expect(compileCoordinateExpr('0/$_id', { _id: 'vs1._id' })).toBe(
            "'0/' + escapeAttr(String(vs1._id))",
        );
    });

    it('should compile multiple placeholders', () => {
        expect(
            compileCoordinateExpr('$outer/$inner/0', {
                outer: 'vs1.outerKey',
                inner: 'vs2.innerKey',
            }),
        ).toBe("escapeAttr(String(vs1.outerKey)) + '/' + escapeAttr(String(vs2.innerKey)) + '/0'");
    });

    it('should throw for unmapped placeholder', () => {
        expect(() => compileCoordinateExpr('0/$_id/1', {})).toThrow(
            'no mapping for placeholder "$_id"',
        );
    });
});

describe('isStaticCoordinate', () => {
    it('should return true for static coordinates', () => {
        expect(isStaticCoordinate('product-card:0/0')).toBe(true);
        expect(isStaticCoordinate('0')).toBe(true);
        expect(isStaticCoordinate('p1/product-card:0')).toBe(true);
    });

    it('should return false for dynamic coordinates', () => {
        expect(isStaticCoordinate('0/$_id/1')).toBe(false);
        expect(isStaticCoordinate('$_id')).toBe(false);
    });
});

describe('computeInstanceKey', () => {
    it('should return suffix for static instances', () => {
        expect(computeInstanceKey('product-card:0', 'static')).toBe('product-card:0');
    });

    it('should return prefix/suffix for slowForEach instances', () => {
        expect(computeInstanceKey('product-card:0', 'slowForEach', 'p1')).toBe('p1/product-card:0');
    });

    it('should return undefined for forEach instances (runtime-computed)', () => {
        expect(computeInstanceKey('product-card:0', 'forEach')).toBeUndefined();
    });
});

describe('compileForEachInstanceKeyExpr', () => {
    it('should compile forEach key expression', () => {
        expect(compileForEachInstanceKeyExpr('product-card:0', 'vs1._id')).toBe(
            "String(vs1._id) + ',product-card:0'",
        );
    });

    it('should compile with different trackBy expression', () => {
        expect(compileForEachInstanceKeyExpr('stock-status:0', 'item.sku')).toBe(
            "String(item.sku) + ',stock-status:0'",
        );
    });
});

describe('computeForEachInstanceKey', () => {
    it('should compute runtime forEach key', () => {
        expect(computeForEachInstanceKey('1', 'product-card:0')).toBe('1,product-card:0');
    });

    it('should match the compile-time format', () => {
        // Verify runtime and compile-time produce the same format
        const runtimeKey = computeForEachInstanceKey('abc123', 'stock-status:0');
        expect(runtimeKey).toBe('abc123,stock-status:0');
        // The compile-time equivalent: String(vs1._id) + ',stock-status:0' evaluates to same format
    });
});
