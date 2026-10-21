/** Default lifetime of cached instance listings: 10 minutes (Design Log #227, A3). */
export const DEFAULT_LIST_TTL_MS = 10 * 60_000;

interface SwrEntry<V> {
    value: V;
    loadedAt: number;
}

/**
 * Small stale-while-revalidate cache for expensive, rarely-needed reads such as instance listings
 * (Design Log #227). Within `ttlMs` the cached value is returned; past it the stale value is
 * returned immediately while one background reload runs (single-flight). `fresh: true` awaits a
 * reload. A failed background reload keeps the previous value.
 */
export class SwrCache<V> {
    private readonly entries = new Map<string, SwrEntry<V>>();
    private readonly inflight = new Map<string, Promise<V>>();

    constructor(
        private readonly ttlMs: number = DEFAULT_LIST_TTL_MS,
        private readonly now: () => number = Date.now,
    ) {}

    async get(key: string, load: () => Promise<V>, fresh = false): Promise<V> {
        const entry = this.entries.get(key);
        if (!entry || fresh) return this.reload(key, load);
        if (this.now() - entry.loadedAt >= this.ttlMs) {
            // serve the stale value now, refresh in the background (errors keep the old value)
            this.reload(key, load).catch(() => undefined);
        }
        return entry.value;
    }

    /** Forget a key so the next `get` reloads (e.g. after a local write). */
    invalidate(key: string): void {
        this.entries.delete(key);
    }

    private reload(key: string, load: () => Promise<V>): Promise<V> {
        const existing = this.inflight.get(key);
        if (existing) return existing;
        const promise = load()
            .then((value) => {
                this.entries.set(key, { value, loadedAt: this.now() });
                return value;
            })
            .finally(() => {
                this.inflight.delete(key);
            });
        this.inflight.set(key, promise);
        return promise;
    }
}
