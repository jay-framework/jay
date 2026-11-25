/**
 * Polled action results for gateway timeouts (DL#239).
 *
 * Both dispatchers (dev `action-router.ts`, prod `fetch-action-handler.ts`) run an action's
 * handler through this module when `server.actionPollAfterMs` is configured. If the handler
 * finishes within the budget the response is exactly as today; if the budget expires the
 * dispatcher answers `202 { pending: { ticket } }` and the client long-polls
 * `GET /_jay/action-results/<ticket>` until the result settles.
 *
 * The ticket is derived on the client from a server-issued seed (SSR-injected), so the client
 * holds it from `t=0` and can resume a request the gateway cuts with `502/503/504`. The seed is
 * `base64url(nonce).base64url(HMAC(procSecret, nonce))`; the ticket is `seed.<counter>`. The
 * server verifies the MAC on every POST and poll (so it controls entropy and authenticity), and
 * the per-page-load nonce scopes a ticket to the page that received the seed.
 *
 * The ticket store is in-memory and single-process (see DL#239 Q2). `procSecret` is ephemeral per
 * process — a restart invalidates old seeds, but old tickets are gone from the store anyway.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Per-process signing key for seeds. Ephemeral: regenerated on restart (DL#239 Q11). */
const procSecret = randomBytes(32);

/** How long a settled result stays deliverable after it settles (DL#239 TL;DR 6). */
export const POLLED_RESULT_TTL_MS = 5 * 60 * 1000;

/** Metadata carried with a ticket, so a poll can reapply the action's request-time rules. */
export interface PollableTicketMeta {
    actionName: string;
    /** Whether the delivering poll must re-run the same-origin check (DL#230/#234). */
    needsSameOriginCheck: boolean;
}

/** A settled handler outcome. `run` should not reject; a rejection is kept defensively (TL;DR 9). */
export type Settled<R> = { ok: true; value: R } | { ok: false; error: unknown };

export type BudgetOutcome<R> = { kind: 'done'; settled: Settled<R> } | { kind: 'pending' };

export type AwaitOutcome<R> =
    | { kind: 'done'; settled: Settled<R>; meta: PollableTicketMeta }
    | { kind: 'pending' }
    | { kind: 'unknown' };

// ============================================================================
// Seed / ticket authenticity (DL#239 Q11)
// ============================================================================

function base64url(buf: Buffer): string {
    return buf.toString('base64url');
}

function mac(nonce: string): string {
    return base64url(createHmac('sha256', procSecret).update(nonce).digest());
}

/** A fresh signed seed: `base64url(nonce).base64url(HMAC(procSecret, nonce))`. */
export function issueSeed(): string {
    const nonce = base64url(randomBytes(16));
    return `${nonce}.${mac(nonce)}`;
}

/**
 * True iff `ticket`'s seed carries a MAC this process signed. The ticket is `nonce.mac.<counter>`;
 * only the first two segments are the seed. The dispatcher calls this before any store access.
 */
export function verifyTicket(ticket: string): boolean {
    const parts = ticket.split('.');
    if (parts.length < 3) return false;
    const [nonce, presented] = parts;
    if (!nonce || !presented) return false;
    const expected = mac(nonce);
    // Constant-time compare; lengths must match for timingSafeEqual.
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

// ============================================================================
// Ticket store
// ============================================================================

interface ValueEntry<R = unknown> {
    kind: 'value';
    meta: PollableTicketMeta;
    settled?: Settled<R>;
    /** Resolvers waiting for this entry to settle. */
    waiters: Set<() => void>;
    ttlTimer?: ReturnType<typeof setTimeout>;
}

interface StreamEntry {
    kind: 'stream';
    meta: PollableTicketMeta;
    generator: AsyncGenerator<unknown>;
    /** Chunks held in memory, aligned to `baseIndex` (chunks below an ack are dropped). */
    chunks: unknown[];
    baseIndex: number;
    status: 'running' | 'done' | 'error';
    error?: unknown;
    /** Resolvers waiting for a new chunk / done / error. */
    waiters: Set<() => void>;
    openSegments: number;
    abandonTimer?: ReturnType<typeof setTimeout>;
    ttlTimer?: ReturnType<typeof setTimeout>;
}

type Entry = ValueEntry | StreamEntry;

const store = new Map<string, Entry>();

/** Test-only: clears the store so suites do not leak tickets into one another. */
export function __resetPolledStore(): void {
    for (const entry of store.values()) {
        if (entry.ttlTimer) clearTimeout(entry.ttlTimer);
        if (entry.kind === 'stream' && entry.abandonTimer) clearTimeout(entry.abandonTimer);
    }
    store.clear();
}

function notify(waiters: Set<() => void>): void {
    const pending = [...waiters];
    waiters.clear();
    for (const resolve of pending) resolve();
}

/** Resolves when `waiters` is notified, or after `ms`. Returns true if notified, false on timeout. */
function waitForNotify(waiters: Set<() => void>, ms: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        let timer: ReturnType<typeof setTimeout>;
        const onNotify = () => {
            clearTimeout(timer);
            resolve(true);
        };
        waiters.add(onNotify);
        timer = setTimeout(() => {
            waiters.delete(onNotify);
            resolve(false);
        }, ms);
    });
}

// ============================================================================
// Request/response polling
// ============================================================================

/**
 * Registers `ticket` and races `run()` against the budget. Dedup: if `ticket` is already in
 * flight, attaches to the existing promise instead of calling `run` again (idempotent client
 * retries, TL;DR 3). The rejection handler is attached immediately, so a late failure becomes the
 * stored result and never an unhandled rejection (TL;DR 9).
 */
export async function runPollable<R>(
    ticket: string,
    run: () => Promise<R>,
    budgetMs: number,
    meta: PollableTicketMeta,
): Promise<BudgetOutcome<R>> {
    let entry = store.get(ticket) as ValueEntry<R> | undefined;

    if (!entry) {
        entry = { kind: 'value', meta, waiters: new Set() };
        store.set(ticket, entry as ValueEntry);
        const e = entry;
        run().then(
            (value) => settleValue(e, { ok: true, value }),
            (error) => settleValue(e, { ok: false, error }),
        );
    }

    if (entry.settled) return { kind: 'done', settled: entry.settled };

    const settledInTime = await waitForNotify(entry.waiters, budgetMs);
    if (settledInTime && entry.settled) return { kind: 'done', settled: entry.settled };
    return { kind: 'pending' };
}

function settleValue<R>(entry: ValueEntry<R>, settled: Settled<R>): void {
    if (entry.settled) return;
    entry.settled = settled;
    notify(entry.waiters);
    entry.ttlTimer = setTimeout(() => {
        for (const [key, e] of store) if (e === entry) store.delete(key);
    }, POLLED_RESULT_TTL_MS);
}

/**
 * Waits up to `budgetMs` for `ticket` to settle. A settled result stays deliverable until its TTL
 * (not single-consume, TL;DR 6), so a lost delivery can be re-fetched.
 */
export async function awaitTicket<R>(ticket: string, budgetMs: number): Promise<AwaitOutcome<R>> {
    const entry = store.get(ticket) as ValueEntry<R> | undefined;
    if (!entry || entry.kind !== 'value') return { kind: 'unknown' };

    if (entry.settled) return { kind: 'done', settled: entry.settled, meta: entry.meta };

    const settledInTime = await waitForNotify(entry.waiters, budgetMs);
    if (settledInTime && entry.settled)
        return { kind: 'done', settled: entry.settled, meta: entry.meta };
    return { kind: 'pending' };
}

// ============================================================================
// Streaming deferral (DL#239 TL;DR 10–13)
// ============================================================================

export type StreamSegmentEvent<C> =
    | { kind: 'chunk'; chunk: C }
    | { kind: 'done' }
    | { kind: 'error'; error: unknown }
    | { kind: 'resume' };

/**
 * Starts the pump for a streaming action under the client-held `ticket` (verified first). A
 * server-side loop drains `generator` into a chunk buffer, decoupled from any HTTP response, so a
 * segment can end at the budget and the client resumes with `?from=<cursor>`.
 */
export function openStreamTicket<C>(
    ticket: string,
    generator: AsyncGenerator<C>,
    meta: PollableTicketMeta,
    abandonMs: number,
): void {
    const entry: StreamEntry = {
        kind: 'stream',
        meta,
        generator: generator as AsyncGenerator<unknown>,
        chunks: [],
        baseIndex: 0,
        status: 'running',
        waiters: new Set(),
        openSegments: 0,
    };
    store.set(ticket, entry);
    // Until the first segment opens, an abandoned ticket must still be cleaned up.
    armAbandonTimer(ticket, entry, abandonMs);

    (async () => {
        try {
            for await (const chunk of generator) {
                entry.chunks.push(chunk);
                notify(entry.waiters);
            }
            entry.status = 'done';
        } catch (error) {
            entry.status = 'error';
            entry.error = error;
        }
        notify(entry.waiters);
        scheduleStreamTtl(ticket, entry);
    })();
}

function armAbandonTimer(ticket: string, entry: StreamEntry, abandonMs: number): void {
    if (entry.abandonTimer) clearTimeout(entry.abandonTimer);
    entry.abandonTimer = setTimeout(() => {
        if (entry.openSegments > 0) return;
        // No reader for 2× budget — stop the generator and drop the ticket (TL;DR 12).
        void entry.generator.return(undefined as never).catch(() => {});
        store.delete(ticket);
    }, abandonMs);
}

function scheduleStreamTtl(ticket: string, entry: StreamEntry): void {
    entry.ttlTimer = setTimeout(() => {
        if (store.get(ticket) === entry) store.delete(ticket);
    }, POLLED_RESULT_TTL_MS);
}

/**
 * One segment of a stream, from absolute chunk index `from`, ending within `budgetMs`. Yields
 * buffered and live chunks, then `done`/`error` when the generator finishes, or `resume` when the
 * budget elapses with the generator still running. Chunks below `from` are dropped (the cursor is
 * the client's ack). Returns `undefined` for an unknown or non-stream ticket.
 */
export function readStreamSegment<C>(
    ticket: string,
    from: number,
    budgetMs: number,
    abandonMs: number,
): AsyncIterable<StreamSegmentEvent<C>> | undefined {
    const entry = store.get(ticket) as StreamEntry | undefined;
    if (!entry || entry.kind !== 'stream') return undefined;

    // Drop chunks the client has acknowledged by asking for a later `from`.
    if (from > entry.baseIndex) {
        entry.chunks.splice(0, from - entry.baseIndex);
        entry.baseIndex = from;
    }

    if (entry.abandonTimer) clearTimeout(entry.abandonTimer);
    entry.openSegments++;

    return {
        async *[Symbol.asyncIterator](): AsyncGenerator<StreamSegmentEvent<C>> {
            // A segment lasts at most `budgetMs` of wall-clock, regardless of chunk rate, so each
            // HTTP response stays under the gateway limit even when chunks arrive faster than the
            // budget (DL#239 TL;DR 10). It is a total cap per segment, not an idle timeout.
            const deadline = Date.now() + budgetMs;
            try {
                let i = Math.max(from, entry.baseIndex);
                for (;;) {
                    while (i < entry.baseIndex + entry.chunks.length) {
                        yield { kind: 'chunk', chunk: entry.chunks[i - entry.baseIndex] as C };
                        i++;
                    }
                    if (entry.status === 'done' && i >= entry.baseIndex + entry.chunks.length) {
                        yield { kind: 'done' };
                        return;
                    }
                    if (entry.status === 'error') {
                        yield { kind: 'error', error: entry.error };
                        return;
                    }
                    const remaining = deadline - Date.now();
                    if (remaining <= 0) {
                        yield { kind: 'resume' };
                        return;
                    }
                    // Wait for the next chunk, but never past the segment deadline.
                    await waitForNotify(entry.waiters, remaining);
                }
            } finally {
                entry.openSegments--;
                if (entry.openSegments === 0 && entry.status === 'running')
                    armAbandonTimer(ticket, entry, abandonMs);
            }
        },
    };
}

/**
 * The meta of a stored ticket, or `undefined` if unknown. A poll uses it to decide whether to
 * reapply the same-origin check, before it knows whether the ticket is a value or a stream.
 */
export function peekTicketMeta(ticket: string): PollableTicketMeta | undefined {
    return store.get(ticket)?.meta;
}

/** Test-only: whether a ticket is still in the store. */
export function __hasTicket(ticket: string): boolean {
    return store.has(ticket);
}
