import { describe, it, expect } from 'vitest';
import {
    combineFreshness,
    mergeFreshness,
    DEFAULT_GRACE_SECONDS,
    MIN_TTL_SECONDS,
} from '../lib/freshness';

// DL#226 — freshness of a page = min positive ttl / min positive grace across its slow parts.

describe('mergeFreshness', () => {
    it('takes the minimum positive ttl and grace independently', () => {
        expect(
            mergeFreshness([{ ttl: 300, grace: 7200 }, { ttl: 60, grace: 86400 }, { ttl: 900 }]),
        ).toEqual({ ttl: 60, grace: 7200 });
    });

    it('ignores 0, null and undefined', () => {
        expect(
            mergeFreshness([{ ttl: 0, grace: null }, undefined, { ttl: 120 }, { ttl: null }]),
        ).toEqual({ ttl: 120 });
    });

    it('returns an empty result when no part has an opinion', () => {
        expect(mergeFreshness([{}, { ttl: 0 }, undefined])).toEqual({});
    });

    it('is re-mergeable without baking in defaults', () => {
        const pageAndKeyed = mergeFreshness([{ ttl: 300 }, { ttl: 600 }]);
        const instances = mergeFreshness([{ ttl: 120 }]);
        expect(mergeFreshness([pageAndKeyed, instances])).toEqual({ ttl: 120 });
    });
});

describe('combineFreshness', () => {
    it('has no policy (never stale) without a positive ttl', () => {
        expect(combineFreshness([{ grace: 100 }, { ttl: 0 }])).toEqual({});
    });

    it('applies the ttl floor', () => {
        expect(combineFreshness([{ ttl: 1 }])).toEqual({
            ttl: MIN_TTL_SECONDS,
            grace: DEFAULT_GRACE_SECONDS,
        });
    });

    it('defaults grace to max(12h, ttl)', () => {
        expect(combineFreshness([{ ttl: 3600 }]).grace).toEqual(DEFAULT_GRACE_SECONDS);
        expect(combineFreshness([{ ttl: 2 * DEFAULT_GRACE_SECONDS }]).grace).toEqual(
            2 * DEFAULT_GRACE_SECONDS,
        );
    });

    it('raises a grace smaller than ttl to ttl', () => {
        expect(combineFreshness([{ ttl: 600, grace: 60 }])).toEqual({ ttl: 600, grace: 600 });
    });

    it('keeps an explicit grace', () => {
        expect(combineFreshness([{ ttl: 60, grace: 3600 }])).toEqual({ ttl: 60, grace: 3600 });
    });
});
