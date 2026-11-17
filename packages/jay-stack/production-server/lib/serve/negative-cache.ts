/** Default time a "this instance does not exist" answer is remembered: 10 minutes. */
export const DEFAULT_NEGATIVE_TTL_MS = 10 * 60_000;

/** Default maximum number of remembered 404s (LRU-bounded so URL scanning cannot grow memory). */
export const DEFAULT_NEGATIVE_MAX_ENTRIES = 10_000;

/**
 * In-memory negative cache for render-on-miss (Design Log #227).
 *
 * Remembers that slow render answered a real 404 for `(route, params)` so repeated requests for the
 * same unknown instance cost nothing. Only genuine 404s are added — never errors or timeouts.
 * Per server instance; entries expire after `ttlMs` and the oldest are evicted beyond `maxEntries`.
 */
export class NegativeCache {
    // Map iteration order is insertion order — re-inserting on hit/add keeps it LRU-ordered.
    private readonly entries = new Map<string, number>();

    constructor(
        private readonly ttlMs: number = DEFAULT_NEGATIVE_TTL_MS,
        private readonly maxEntries: number = DEFAULT_NEGATIVE_MAX_ENTRIES,
    ) {}

    has(key: string, now: number): boolean {
        const expiresAt = this.entries.get(key);
        if (expiresAt === undefined) return false;
        if (expiresAt <= now) {
            this.entries.delete(key);
            return false;
        }
        // refresh recency
        this.entries.delete(key);
        this.entries.set(key, expiresAt);
        return true;
    }

    add(key: string, now: number): void {
        this.entries.delete(key);
        this.entries.set(key, now + this.ttlMs);
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value as string;
            this.entries.delete(oldest);
        }
    }

    /** Forget a key (e.g. when the instance turned out to exist). */
    delete(key: string): void {
        this.entries.delete(key);
    }

    get size(): number {
        return this.entries.size;
    }
}
