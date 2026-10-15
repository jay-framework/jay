import { describe, expect, it } from 'vitest';
import {
    matchesScrollRevealAttribute,
    matchesScrollRevealImport,
    matchesScrollRevealScriptSrc,
} from '../../lib/css-first/scroll-reveal-libraries.js';

describe('matchesScrollRevealScriptSrc', () => {
    it('matches common CDN paths for AOS, WOW.js, and ScrollReveal', () => {
        expect(matchesScrollRevealScriptSrc('https://cdn.jsdelivr.net/npm/aos@2.3.4/dist/aos.js')).toBe(
            true,
        );
        expect(
            matchesScrollRevealScriptSrc(
                'https://cdnjs.cloudflare.com/ajax/libs/wow/1.1.2/wow.min.js',
            ),
        ).toBe(true);
        expect(matchesScrollRevealScriptSrc('https://unpkg.com/scrollreveal/dist/scrollreveal.min.js')).toBe(
            true,
        );
        expect(matchesScrollRevealScriptSrc('/vendor/aos/aos.min.js')).toBe(true);
    });

    it('does not match unrelated URLs that merely contain substrings', () => {
        expect(matchesScrollRevealScriptSrc('https://example.com/js/showcase.js')).toBe(false);
        expect(matchesScrollRevealScriptSrc('https://example.com/assets/chaos-animation.js')).toBe(false);
        expect(matchesScrollRevealScriptSrc('https://example.com/lib/mywow-bundle.js')).toBe(false);
    });
});

describe('matchesScrollRevealImport', () => {
    it('matches bare package specifiers only', () => {
        expect(matchesScrollRevealImport('aos')).toBe(true);
        expect(matchesScrollRevealImport('scrollreveal')).toBe(true);
        expect(matchesScrollRevealImport('wow.js')).toBe(true);
        expect(matchesScrollRevealImport('lodash')).toBe(false);
    });

    it('does not match relative paths', () => {
        expect(matchesScrollRevealImport('./aos')).toBe(false);
        expect(matchesScrollRevealImport('./effects/wow.js')).toBe(false);
    });
});

describe('matchesScrollRevealAttribute', () => {
    it('matches library data attributes', () => {
        expect(matchesScrollRevealAttribute('data-aos')).toBe(true);
        expect(matchesScrollRevealAttribute('data-aos-duration')).toBe(true);
        expect(matchesScrollRevealAttribute('data-wow-delay')).toBe(true);
        expect(matchesScrollRevealAttribute('data-sr-id')).toBe(true);
        expect(matchesScrollRevealAttribute('data-custom')).toBe(false);
    });

    it('does not match screen-reader-only conventions', () => {
        expect(matchesScrollRevealAttribute('data-sr-only')).toBe(false);
    });
});
