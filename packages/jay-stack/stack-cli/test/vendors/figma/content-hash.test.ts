import { describe, it, expect } from 'vitest';
import { normalizeForHash, computeContentHash, hasContentDiverged } from '../../../lib/vendors/figma/content-hash';

describe('Content Hash', () => {
    describe('normalizeForHash', () => {
        it('strips trailing whitespace per line', () => {
            expect(normalizeForHash('hello   \nworld  ')).toBe('hello\nworld');
        });

        it('normalizes CRLF to LF', () => {
            expect(normalizeForHash('hello\r\nworld')).toBe('hello\nworld');
        });

        it('normalizes bare CR to LF', () => {
            expect(normalizeForHash('hello\rworld')).toBe('hello\nworld');
        });

        it('trims trailing newlines', () => {
            expect(normalizeForHash('hello\nworld\n\n\n')).toBe('hello\nworld');
        });

        it('preserves leading whitespace (indentation)', () => {
            expect(normalizeForHash('  hello\n    world')).toBe('  hello\n    world');
        });
    });

    describe('computeContentHash', () => {
        it('produces consistent hashes for identical content', () => {
            const hash1 = computeContentHash('<div>hello</div>');
            const hash2 = computeContentHash('<div>hello</div>');
            expect(hash1).toBe(hash2);
        });

        it('produces different hashes for different content', () => {
            const hash1 = computeContentHash('<div>hello</div>');
            const hash2 = computeContentHash('<div>world</div>');
            expect(hash1).not.toBe(hash2);
        });

        it('formatting-only changes produce the same hash', () => {
            const original = '<div>hello</div>\n<p>world</p>';
            const formatted = '<div>hello</div>  \n<p>world</p>\n\n';
            expect(computeContentHash(original)).toBe(computeContentHash(formatted));
        });

        it('CRLF vs LF produce the same hash', () => {
            const lf = '<div>hello</div>\n<p>world</p>';
            const crlf = '<div>hello</div>\r\n<p>world</p>';
            expect(computeContentHash(lf)).toBe(computeContentHash(crlf));
        });

        it('semantic changes produce a different hash', () => {
            const v1 = '<div style="color: red;">hello</div>';
            const v2 = '<div style="color: blue;">hello</div>';
            expect(computeContentHash(v1)).not.toBe(computeContentHash(v2));
        });
    });

    describe('hasContentDiverged', () => {
        it('returns false when content is unchanged', () => {
            const content = '<div>hello</div>';
            const hash = computeContentHash(content);
            expect(hasContentDiverged(hash, content)).toBe(false);
        });

        it('returns false when only formatting changed', () => {
            const original = '<div>hello</div>\n<p>world</p>';
            const hash = computeContentHash(original);
            const formatted = '<div>hello</div>   \r\n<p>world</p>\n\n';
            expect(hasContentDiverged(hash, formatted)).toBe(false);
        });

        it('returns true when content semantically changed', () => {
            const original = '<div style="color: red;">hello</div>';
            const hash = computeContentHash(original);
            const changed = '<div style="color: blue;">hello</div>';
            expect(hasContentDiverged(hash, changed)).toBe(true);
        });
    });
});
