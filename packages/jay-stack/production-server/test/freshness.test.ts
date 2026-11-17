import { describe, it, expect } from 'vitest';
import { classify, applyFreshness } from '../lib/serve/freshness';

// DL#226 — classify an entry and rewrite response headers for the data actually served.

const T0 = 1_700_000_000_000;
const entry = { renderedAt: T0, ttl: 60, grace: 600 };

describe('classify', () => {
    it('is fresh without a freshness contract', () => {
        expect(classify({}, T0 + 10 ** 9)).toEqual('fresh');
        expect(classify({ renderedAt: T0 }, T0 + 10 ** 9)).toEqual('fresh');
        expect(classify({ ttl: 60 }, T0 + 10 ** 9)).toEqual('fresh');
    });

    it('is fresh below ttl, stale until grace, expired after', () => {
        expect(classify(entry, T0 + 59_999)).toEqual('fresh');
        expect(classify(entry, T0 + 60_000)).toEqual('stale');
        expect(classify(entry, T0 + 599_999)).toEqual('stale');
        expect(classify(entry, T0 + 600_000)).toEqual('expired');
    });

    it('defaults grace to 12h and never lets grace undercut ttl', () => {
        const noGrace = { renderedAt: T0, ttl: 60 };
        expect(classify(noGrace, T0 + 12 * 3600 * 1000 - 1)).toEqual('stale');
        expect(classify(noGrace, T0 + 12 * 3600 * 1000)).toEqual('expired');
        expect(classify({ renderedAt: T0, ttl: 600, grace: 60 }, T0 + 599_000)).toEqual('fresh');
        expect(classify({ renderedAt: T0, ttl: 600, grace: 60 }, T0 + 600_000)).toEqual('expired');
    });
});

describe('applyFreshness', () => {
    it('returns headers unchanged without a freshness contract', () => {
        const headers = { 'Cache-Control': 'public, max-age=3600' };
        expect(applyFreshness(headers, {}, 'fresh', T0)).toEqual(headers);
    });

    it('serves old data as no-store, dropping Expires, keeping validators', () => {
        const headers = {
            'Cache-Control': 'public, max-age=3600',
            Expires: 'Wed, 21 Oct 2026 07:28:00 GMT',
            'Last-Modified': 'Wed, 21 Oct 2026 07:00:00 GMT',
            ETag: '"abc"',
        };
        expect(applyFreshness(headers, entry, 'stale', T0 + 20_000 + 60_000)).toEqual({
            'Cache-Control': 'no-store',
            'Last-Modified': 'Wed, 21 Oct 2026 07:00:00 GMT',
            ETag: `"abc-${T0}"`,
            'jay-freshness': 'stale, 80000ms',
        });
    });

    it('treats expired like stale for headers', () => {
        expect(applyFreshness({}, entry, 'expired', T0 + 700_000)).toEqual({
            'Cache-Control': 'no-store',
            'jay-freshness': 'expired, 700000ms',
        });
    });

    it('clamps max-age / s-maxage to the remaining ttl and strips stale-* directives', () => {
        const headers = {
            'cache-control':
                'public, max-age=3600, s-maxage=7200, stale-while-revalidate=60, stale-if-error=600',
        };
        expect(applyFreshness(headers, entry, 'fresh', T0 + 20_000)).toEqual({
            'cache-control': 'public, max-age=40, s-maxage=40',
            'jay-freshness': 'fresh, 20000ms',
        });
    });

    it('keeps shorter max-age and stricter directives', () => {
        expect(
            applyFreshness({ 'Cache-Control': 'private, max-age=5' }, entry, 'fresh', T0),
        ).toEqual({ 'Cache-Control': 'private, max-age=5', 'jay-freshness': 'fresh, 0ms' });
    });

    it('does not invent Cache-Control when fast render set none', () => {
        expect(applyFreshness({}, entry, 'fresh', T0 + 1000)).toEqual({
            'jay-freshness': 'fresh, 1000ms',
        });
    });

    it('can turn the freshness header off', () => {
        expect(applyFreshness({}, entry, 'fresh', T0, { freshnessHeader: false })).toEqual({});
    });

    it('folds renderedAt into weak and strong ETags', () => {
        expect(
            applyFreshness({ ETag: 'W/"x"' }, entry, 'fresh', T0, { freshnessHeader: false }),
        ).toEqual({ ETag: `W/"x-${T0}"` });
    });
});
