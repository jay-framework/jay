import { describe, it, expect } from 'vitest';
import { debugPageName } from '../lib';

describe('debugPageName', () => {
    it('drops the query string (the ENAMETOOLONG fix)', () => {
        const name = debugPageName('/aiditor?remoteMachineSessionP=' + 'a'.repeat(800));
        expect(name).toBe('aiditor');
        expect(name.length).toBeLessThanOrEqual(200);
    });

    it('maps root and empty/undefined to index', () => {
        expect(debugPageName('/')).toBe('index');
        expect(debugPageName('')).toBe('index');
        expect(debugPageName(undefined)).toBe('index');
        expect(debugPageName('/?x=1')).toBe('index');
    });

    it('turns nested routes into dash-joined names', () => {
        expect(debugPageName('/products/x')).toBe('products-x');
    });

    it('sanitizes dynamic-route brackets and other non-fs-safe chars', () => {
        expect(debugPageName('/products/[slug]')).toBe('products-_slug_');
        expect(debugPageName('/a b/c:d')).toBe('a_b-c_d');
    });

    it('keeps a trailing-slash route distinguishable', () => {
        expect(debugPageName('/about/')).toBe('about-');
    });

    it('caps length under NAME_MAX', () => {
        expect(debugPageName('/' + 'x'.repeat(300)).length).toBe(200);
    });
});
