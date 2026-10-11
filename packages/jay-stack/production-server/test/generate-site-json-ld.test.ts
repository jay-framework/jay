import { describe, it, expect } from 'vitest';
import { generateSiteJsonLd } from '../lib/builder/generate-site-json-ld';

/** Parse the JSON body of a generated JSON-LD HeadTag. */
function parse(tag: { children?: string }): any {
    return JSON.parse(tag.children ?? '');
}

describe('generateSiteJsonLd (DL#213)', () => {
    it('returns [] when site.name is absent', () => {
        expect(generateSiteJsonLd(undefined)).toEqual([]);
        expect(generateSiteJsonLd({})).toEqual([]);
        expect(generateSiteJsonLd({ baseUrl: 'https://x.com' })).toEqual([]);
    });

    it('emits Organization + WebSite when name is present', () => {
        const tags = generateSiteJsonLd({ name: 'Acme', baseUrl: 'https://acme.com/' });
        expect(tags.length).toBe(2);
        expect(
            tags.every((t) => t.tag === 'script' && t.attrs?.type === 'application/ld+json'),
        ).toBe(true);
        expect(parse(tags[0])).toEqual({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Acme',
            url: 'https://acme.com',
        });
        expect(parse(tags[1])).toEqual({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Acme',
            url: 'https://acme.com',
        });
    });

    it('includes logo, description, sameAs on Organization when provided', () => {
        const tags = generateSiteJsonLd({
            name: 'Acme',
            baseUrl: 'https://acme.com',
            logo: '/logo.png',
            description: 'We make things',
            sameAs: ['https://twitter.com/acme'],
        });
        expect(parse(tags[0])).toEqual({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Acme',
            url: 'https://acme.com',
            logo: 'https://acme.com/logo.png',
            description: 'We make things',
            sameAs: ['https://twitter.com/acme'],
        });
    });

    it('keeps an absolute logo URL as-is', () => {
        const tags = generateSiteJsonLd({
            name: 'Acme',
            baseUrl: 'https://acme.com',
            logo: 'https://cdn.acme.com/logo.png',
        });
        expect(parse(tags[0]).logo).toBe('https://cdn.acme.com/logo.png');
    });

    it('omits url when no baseUrl is set', () => {
        const tags = generateSiteJsonLd({ name: 'Acme' });
        expect(parse(tags[0])).toEqual({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Acme',
        });
    });
});
