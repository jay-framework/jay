import { describe, it, expect } from 'vitest';
import { compileCoordinateExpr, isStaticCoordinate } from '../lib';

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
        expect(
            compileCoordinateExpr('$_id/product-card:0/0', { _id: 'vs1._id' }),
        ).toBe("escapeAttr(String(vs1._id)) + '/product-card:0/0'");
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
