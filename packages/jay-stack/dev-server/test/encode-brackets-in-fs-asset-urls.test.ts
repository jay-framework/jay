import { describe, it, expect } from 'vitest';
import { encodeBracketsInAssetUrls } from '../lib';

describe('encodeBracketsInAssetUrls', () => {
    it('encodes [ and ] in an /@fs/ stylesheet href, keeping the query string', () => {
        const input =
            '<link rel="stylesheet" href="/@fs/user-code/build/dev/pre-rendered/products/[slug]/page.css?v=a8e6206b&direct">';
        const expected =
            '<link rel="stylesheet" href="/@fs/user-code/build/dev/pre-rendered/products/%5Bslug%5D/page.css?v=a8e6206b&direct">';
        expect(encodeBracketsInAssetUrls(input)).toBe(expected);
    });

    it('encodes brackets in a root-relative asset URL (not just /@fs/) — matches production', () => {
        const input =
            '<link rel="stylesheet" href="/build/dev/pre-rendered/blog/[...rest]/page.css?direct">';
        const expected =
            '<link rel="stylesheet" href="/build/dev/pre-rendered/blog/%5B...rest%5D/page.css?direct">';
        expect(encodeBracketsInAssetUrls(input)).toBe(expected);
    });

    it('encodes brackets in a script src', () => {
        const input =
            '<script type="module" src="/@fs/user-code/build/dev/pre-rendered/blog/[slug]/page.jay-html?v=1"></script>';
        const expected =
            '<script type="module" src="/@fs/user-code/build/dev/pre-rendered/blog/%5Bslug%5D/page.jay-html?v=1"></script>';
        expect(encodeBracketsInAssetUrls(input)).toBe(expected);
    });

    it('leaves URLs without brackets untouched', () => {
        const input =
            '<link rel="stylesheet" href="/@fs/user-code/build/dev/pre-rendered/about/page.css?direct">';
        expect(encodeBracketsInAssetUrls(input)).toBe(input);
    });

    it('does not encode brackets that appear only in the query string', () => {
        const input = '<script src="/build/app.js?list[]=1"></script>';
        expect(encodeBracketsInAssetUrls(input)).toBe(input);
    });

    it('does not touch text content or non-URL attributes', () => {
        const input = '<p data-note="a[0]">see list[0]</p>';
        expect(encodeBracketsInAssetUrls(input)).toBe(input);
    });
});
