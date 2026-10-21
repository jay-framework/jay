import type { CacheEntry, InstanceEntry, RouteEntry } from '../types';
import type { ArtifactStore } from './artifact-store';
import { instanceKey, synthesizeInstance } from '../shared/instance-key';
import { NegativeCache } from './negative-cache';
import { renderInstance, type RenderInstanceFn } from './render-instance';
import { getLogger } from '@jay-framework/logger';

/** Default number of slow renders that may run at once, shared by refreshes and render-on-miss. */
export const DEFAULT_SLOW_RENDER_CONCURRENCY = 5;
/** Default time a visitor waits for a render-on-miss before getting a 503. */
export const DEFAULT_MISS_TIMEOUT_MS = 8000;
/** `Retry-After` (seconds) sent with a render-on-miss 503. */
export const DEFAULT_RETRY_AFTER_SECONDS = 2;

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_CAP_MS = 5 * 60_000;

/** Result of asking for a background refresh of an existing instance. */
export type RefreshStart =
    /** A refresh is running (started now, or joined an in-flight one). `done` never rejects. */
    | { kind: 'started' | 'joined'; done: Promise<CacheEntry | undefined> }
    /** All slow-render slots are taken by other instances — nothing started, nothing queued. */
    | { kind: 'busy' }
    /** Refresh is not possible right now: store is read-only, or the instance is in failure backoff. */
    | { kind: 'skipped' };

/** Result of render-on-miss for an instance that does not exist yet (Design Log #227). */
export type MissOutcome =
    | { kind: 'rendered'; instance: InstanceEntry }
    /** The item does not exist (slow render answered a deterministic 4xx, e.g. 404). */
    | { kind: 'notFound' }
    /** Slow render redirected (e.g. renamed slug): respond with this redirect. */
    | { kind: 'redirect'; status: number; location: string }
    /** Could not render now: no free slot, timeout, error, or backoff. Respond 503 + Retry-After. */
    | { kind: 'unavailable'; retryAfterSeconds: number };

export interface InstanceRendererOptions {
    /** Max concurrent slow renders (refresh + miss). Env `JAY_SLOW_RENDER_CONCURRENCY`, default 5. */
    concurrency?: number;
    /** Max wait of a render-on-miss. Env `JAY_MISS_TIMEOUT_MS`, default 8000. */
    missTimeoutMs?: number;
    retryAfterSeconds?: number;
    negativeCache?: NegativeCache;
    now?: () => number;
    /** Slow-render function (tests inject fakes). */
    render?: RenderInstanceFn;
}

type FlightResult =
    | { kind: 'rendered'; entry: CacheEntry }
    | { kind: 'notFound' }
    | { kind: 'redirect'; status: number; location: string }
    | { kind: 'error' };

interface RedirectEntry {
    status: number;
    location: string;
    expiresAt: number;
}

/** Redirects are remembered like 404s so a crawled redirecting URL does not cost a slow render per hit. */
const REDIRECT_TTL_MS = 10 * 60_000;
const REDIRECT_MAX_ENTRIES = 1_000;

interface Backoff {
    failures: number;
    nextAttemptAt: number;
}

function envNumber(name: string, fallback: number): number {
    const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
    const value = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Runs the slow phase for single instances in production (Design Log #226 / #227).
 *
 * - **Single-flight**: all concurrent requests for one instance (same route + params → same key)
 *   share one slow render, one slot and one write; followers never take a slot.
 * - **Fixed slots, no queue**: at most `concurrency` renders run at once. When all slots are taken
 *   by other instances a refresh answers `busy` (the caller serves the old data) and a miss answers
 *   `unavailable` (the caller responds 503). Nothing is ever queued.
 * - **Backoff**: a failed render puts the instance into exponential backoff.
 * - **Negative cache**: a deterministic 4xx (404, 410, 400, 422, …) and redirects are remembered
 *   (10 min); transient errors (401/403/408/429, 5xx, thrown) never are.
 *
 * Persisting goes through the {@link ArtifactStore} (`writeCacheData` / `removeInstance`), so the
 * same code serves the filesystem and shared stores.
 */
export class InstanceRenderer {
    private readonly concurrency: number;
    private readonly missTimeoutMs: number;
    private readonly retryAfterSeconds: number;
    private readonly negativeCache: NegativeCache;
    private readonly now: () => number;
    private readonly render: RenderInstanceFn;
    private readonly flights = new Map<string, Promise<FlightResult>>();
    private readonly backoff = new Map<string, Backoff>();
    private readonly redirects = new Map<string, RedirectEntry>();
    private slotsInUse = 0;
    private busyCount = 0;

    constructor(
        private readonly store: ArtifactStore,
        options: InstanceRendererOptions = {},
    ) {
        this.concurrency =
            options.concurrency ??
            envNumber('JAY_SLOW_RENDER_CONCURRENCY', DEFAULT_SLOW_RENDER_CONCURRENCY);
        this.missTimeoutMs =
            options.missTimeoutMs ?? envNumber('JAY_MISS_TIMEOUT_MS', DEFAULT_MISS_TIMEOUT_MS);
        this.retryAfterSeconds = options.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS;
        this.negativeCache = options.negativeCache ?? new NegativeCache();
        this.now = options.now ?? Date.now;
        this.render = options.render ?? renderInstance;
    }

    /** True when the store can persist rendered instances (otherwise refresh / render-on-miss are off). */
    get canWrite(): boolean {
        return typeof this.store.writeCacheData === 'function';
    }

    /** Monitoring counters. */
    stats(): { slotsInUse: number; inFlight: number; busy: number; negativeEntries: number } {
        return {
            slotsInUse: this.slotsInUse,
            inFlight: this.flights.size,
            busy: this.busyCount,
            negativeEntries: this.negativeCache.size,
        };
    }

    /**
     * Refresh an existing instance in the background. Never waits for a slot and never throws.
     * Callers may await `done` (only for `started` / `joined`) up to their own budget.
     */
    refresh(route: RouteEntry, params: Record<string, string>): RefreshStart {
        if (!this.canWrite) return { kind: 'skipped' };
        const key = instanceKey(route.pattern, params);

        const inFlight = this.flights.get(key);
        if (inFlight) return { kind: 'joined', done: this.toEntry(inFlight) };

        if (this.inBackoff(key)) return { kind: 'skipped' };
        if (this.slotsInUse >= this.concurrency) {
            this.busyCount++;
            return { kind: 'busy' };
        }
        return { kind: 'started', done: this.toEntry(this.startFlight(key, route, params, true)) };
    }

    /**
     * Serve an instance that does not exist yet: render it once for all concurrent requests,
     * persist it, and return the synthesized instance. A real 404 is negative-cached.
     */
    async renderMissing(route: RouteEntry, params: Record<string, string>): Promise<MissOutcome> {
        const key = instanceKey(route.pattern, params);
        if (this.negativeCache.has(key, this.now())) return { kind: 'notFound' };
        const known = this.redirects.get(key);
        if (known && known.expiresAt > this.now()) {
            return { kind: 'redirect', status: known.status, location: known.location };
        }
        // Read-only store: cannot persist new instances — behave like a build-time-only deployment.
        if (!this.canWrite) return { kind: 'notFound' };

        let flight = this.flights.get(key);
        if (!flight) {
            if (this.inBackoff(key) || this.slotsInUse >= this.concurrency) {
                if (this.slotsInUse >= this.concurrency) this.busyCount++;
                return this.unavailable();
            }
            flight = this.startFlight(key, route, params, false);
        }

        const result = await this.withTimeout(flight, this.missTimeoutMs);
        if (result === undefined) return this.unavailable(); // timed out; the render keeps going
        if (result.kind === 'rendered') {
            return { kind: 'rendered', instance: synthesizeInstance(route, params) };
        }
        if (result.kind === 'notFound') return { kind: 'notFound' };
        if (result.kind === 'redirect') {
            return { kind: 'redirect', status: result.status, location: result.location };
        }
        return this.unavailable();
    }

    /** True when `(route, params)` is remembered as non-existent. */
    isKnownMissing(route: RouteEntry, params: Record<string, string>): boolean {
        return this.negativeCache.has(instanceKey(route.pattern, params), this.now());
    }

    private unavailable(): MissOutcome {
        return { kind: 'unavailable', retryAfterSeconds: this.retryAfterSeconds };
    }

    private inBackoff(key: string): boolean {
        const backoff = this.backoff.get(key);
        return backoff !== undefined && backoff.nextAttemptAt > this.now();
    }

    private startFlight(
        key: string,
        route: RouteEntry,
        params: Record<string, string>,
        existing: boolean,
    ): Promise<FlightResult> {
        this.slotsInUse++;
        const flight = this.runFlight(key, route, params, existing).finally(() => {
            this.slotsInUse--;
            this.flights.delete(key);
        });
        this.flights.set(key, flight);
        return flight;
    }

    private async runFlight(
        key: string,
        route: RouteEntry,
        params: Record<string, string>,
        existing: boolean,
    ): Promise<FlightResult> {
        const logger = getLogger();
        try {
            const outcome = await this.render(route, params, this.store, this.now());
            if (outcome.kind === 'rendered') {
                await this.store.writeCacheData!(route, params, outcome.entry);
                this.backoff.delete(key);
                this.negativeCache.delete(key);
                return { kind: 'rendered', entry: outcome.entry };
            }
            if (outcome.kind === 'notFound') {
                this.backoff.delete(key);
                this.negativeCache.add(key, this.now());
                // A known instance whose item is gone: stop advertising it.
                if (existing) await this.store.removeInstance?.(route, params);
                return { kind: 'notFound' };
            }
            if (outcome.kind === 'redirect') {
                if (!existing) {
                    this.backoff.delete(key);
                    this.rememberRedirect(key, outcome.status, outcome.location);
                    return { kind: 'redirect', status: outcome.status, location: outcome.location };
                }
                // A known instance that now redirects: keep serving its stored data, retry later.
                this.recordFailure(key);
                logger.warn(`[Refresh] ${key}: slow render now redirects to ${outcome.location}`);
                return { kind: 'error' };
            }
            this.recordFailure(key);
            logger.warn(`[Refresh] ${key}: ${outcome.reason}`);
            return { kind: 'error' };
        } catch (err: any) {
            this.recordFailure(key);
            logger.warn(`[Refresh] ${key}: ${err?.message ?? err}`);
            return { kind: 'error' };
        }
    }

    private rememberRedirect(key: string, status: number, location: string): void {
        this.redirects.delete(key);
        this.redirects.set(key, { status, location, expiresAt: this.now() + REDIRECT_TTL_MS });
        while (this.redirects.size > REDIRECT_MAX_ENTRIES) {
            this.redirects.delete(this.redirects.keys().next().value as string);
        }
    }

    private recordFailure(key: string): void {
        const failures = (this.backoff.get(key)?.failures ?? 0) + 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_CAP_MS);
        this.backoff.set(key, { failures, nextAttemptAt: this.now() + delay });
    }

    private toEntry(flight: Promise<FlightResult>): Promise<CacheEntry | undefined> {
        return flight.then((result) => (result.kind === 'rendered' ? result.entry : undefined));
    }

    private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<undefined>((resolve) => {
            timer = setTimeout(() => resolve(undefined), ms);
        });
        try {
            return await Promise.race([promise, timeout]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }
}
