import { describe, it, expect } from 'vitest';
import { WithValidations } from '../lib/with-validations';

describe('WithValidations', () => {
    describe('map', () => {
        it('should call func for truthy values', () => {
            const wv = new WithValidations('hello');
            const result = wv.map((v) => v.toUpperCase());
            expect(result.val).toBe('HELLO');
        });

        it('should skip func for undefined', () => {
            const wv = new WithValidations<string>(undefined);
            const result = wv.map((v) => v.toUpperCase());
            expect(result.val).toBeUndefined();
        });

        it('should call func for empty string (falsy but valid)', () => {
            const wv = new WithValidations('');
            const result = wv.map((v) => `[${v}]`);
            expect(result.val).toBe('[]');
        });

        it('should call func for 0 (falsy but valid)', () => {
            const wv = new WithValidations(0);
            const result = wv.map((v) => v + 1);
            expect(result.val).toBe(1);
        });

        it('should call func for false (falsy but valid)', () => {
            const wv = new WithValidations(false);
            const result = wv.map((v) => !v);
            expect(result.val).toBe(true);
        });

        it('should call func for null (falsy but valid)', () => {
            const wv = new WithValidations<string | null>(null);
            const result = wv.map((v) => v === null ? 'was null' : v);
            expect(result.val).toBe('was null');
        });

        it('should preserve validations', () => {
            const wv = new WithValidations('', ['warning']);
            const result = wv.map((v) => `[${v}]`);
            expect(result.val).toBe('[]');
            expect(result.validations).toEqual(['warning']);
        });
    });

    describe('flatMap', () => {
        it('should call func for empty string', () => {
            const wv = new WithValidations('');
            const result = wv.flatMap((v) => new WithValidations(`[${v}]`));
            expect(result.val).toBe('[]');
        });

        it('should call func for 0', () => {
            const wv = new WithValidations(0);
            const result = wv.flatMap((v) => new WithValidations(v + 1));
            expect(result.val).toBe(1);
        });

        it('should skip func for undefined', () => {
            const wv = new WithValidations<string>(undefined);
            const result = wv.flatMap((v) => new WithValidations(v.toUpperCase()));
            expect(result.val).toBeUndefined();
        });
    });

    describe('map with side effects (setAttribute pattern)', () => {
        it('should execute side effect when resolved value is empty string', () => {
            // This is the exact pattern used in slow-render-transform for attributes
            const resolved = new WithValidations(''); // empty string from resolveTextBindings
            let sideEffectCalled = false;
            let sideEffectValue: string | undefined;

            resolved.map((val) => {
                sideEffectCalled = true;
                sideEffectValue = val;
                return null;
            });

            expect(sideEffectCalled).toBe(true);
            expect(sideEffectValue).toBe('');
        });

        it('should NOT execute side effect when value is undefined', () => {
            const resolved = new WithValidations<string>(undefined);
            let sideEffectCalled = false;

            resolved.map((val) => {
                sideEffectCalled = true;
                return null;
            });

            expect(sideEffectCalled).toBe(false);
        });
    });
});
