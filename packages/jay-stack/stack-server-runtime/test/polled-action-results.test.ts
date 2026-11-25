import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    issueSeed,
    verifyTicket,
    runPollable,
    awaitTicket,
    openStreamTicket,
    readStreamSegment,
    POLLED_RESULT_TTL_MS,
    __resetPolledStore,
    __hasTicket,
    type PollableTicketMeta,
    type StreamSegmentEvent,
} from '../lib';

const META: PollableTicketMeta = { actionName: 'test.action', needsSameOriginCheck: false };

/** A ticket for a fresh seed plus a counter, as the client would assemble it. */
function ticket(counter = 0): string {
    return `${issueSeed()}.${counter}`;
}

const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/** Lets pending microtasks (the pump loop, settle callbacks) run under fake timers. */
const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function collect<C>(
    segment: AsyncIterable<StreamSegmentEvent<C>> | undefined,
): Promise<StreamSegmentEvent<C>[]> {
    const events: StreamSegmentEvent<C>[] = [];
    for await (const e of segment!) events.push(e);
    return events;
}

describe('deferred-action-results — seed / ticket (Q11)', () => {
    beforeEach(() => __resetPolledStore());

    it('accepts a ticket derived from issueSeed', () => {
        expect(verifyTicket(ticket(0))).toBe(true);
        expect(verifyTicket(ticket(7))).toBe(true);
    });

    it('rejects a forged or tampered MAC', () => {
        const [nonce] = issueSeed().split('.');
        expect(verifyTicket(`${nonce}.not-the-mac.0`)).toBe(false);
        const t = ticket(0);
        const tampered = t.slice(0, -5) + 'xxxxx';
        expect(verifyTicket(tampered)).toBe(false);
    });

    it('rejects a malformed ticket (missing segments)', () => {
        expect(verifyTicket('justone')).toBe(false);
        expect(verifyTicket('nonce.mac')).toBe(false);
        expect(verifyTicket('')).toBe(false);
    });
});

describe('deferred-action-results — request/response', () => {
    beforeEach(() => {
        __resetPolledStore();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('resolves within budget', async () => {
        const t = ticket();
        const out = await runPollable(t, async () => 42, 1000, META);
        expect(out).toEqual({ kind: 'done', settled: { ok: true, value: 42 } });
    });

    it('goes pending past the budget, then delivers on poll', async () => {
        const t = ticket();
        const d = deferred<string>();
        const first = runPollable(t, () => d.promise, 50, META);
        await vi.advanceTimersByTimeAsync(60);
        expect(await first).toEqual({ kind: 'pending' });

        const polling = awaitTicket<string>(t, 50);
        d.resolve('hello');
        await flush();
        expect(await polling).toEqual({
            kind: 'done',
            settled: { ok: true, value: 'hello' },
            meta: META,
        });
    });

    it('stays pending across a poll that times out, then delivers on the next', async () => {
        const t = ticket();
        const d = deferred<string>();
        await (async () => {
            const first = runPollable(t, () => d.promise, 50, META);
            await vi.advanceTimersByTimeAsync(60);
            await first;
        })();

        const poll1 = awaitTicket<string>(t, 50);
        await vi.advanceTimersByTimeAsync(60);
        expect(await poll1).toEqual({ kind: 'pending' });

        const poll2 = awaitTicket<string>(t, 50);
        d.resolve('done');
        await flush();
        expect(await poll2).toMatchObject({ kind: 'done', settled: { ok: true, value: 'done' } });
    });

    it('runs the handler exactly once across a retried POST (dedup / attach)', async () => {
        const t = ticket();
        const d = deferred<number>();
        const run = vi.fn(() => d.promise);

        const first = runPollable(t, run, 50, META);
        await vi.advanceTimersByTimeAsync(60);
        expect(await first).toEqual({ kind: 'pending' });

        // Client re-POSTs the same ticket after a 504 — must attach, not re-run.
        const second = runPollable(t, run, 50, META);
        d.resolve(7);
        await flush();
        expect(await second).toEqual({ kind: 'done', settled: { ok: true, value: 7 } });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('returns the stored result for a settled ticket re-POSTed later', async () => {
        const t = ticket();
        const run = vi.fn(async () => 'v');
        await runPollable(t, run, 1000, META);
        const again = await runPollable(t, run, 1000, META);
        expect(again).toEqual({ kind: 'done', settled: { ok: true, value: 'v' } });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('re-delivers a settled result until the TTL, then forgets it', async () => {
        const t = ticket();
        await runPollable(t, async () => 'x', 1000, META);
        expect(await awaitTicket(t, 10)).toMatchObject({ kind: 'done' });
        // Still there just before the TTL...
        await vi.advanceTimersByTimeAsync(POLLED_RESULT_TTL_MS - 1);
        expect(await awaitTicket(t, 10)).toMatchObject({ kind: 'done' });
        // ...gone just after.
        await vi.advanceTimersByTimeAsync(2);
        expect(await awaitTicket(t, 10)).toEqual({ kind: 'unknown' });
    });

    it('reports an unknown ticket', async () => {
        expect(await awaitTicket(ticket(), 10)).toEqual({ kind: 'unknown' });
    });

    it('carries a late rejection as the result with no unhandled rejection', async () => {
        const t = ticket();
        const d = deferred<number>();
        const first = runPollable(t, () => d.promise, 50, META);
        await vi.advanceTimersByTimeAsync(60);
        expect(await first).toEqual({ kind: 'pending' });

        const boom = new Error('late failure');
        d.reject(boom);
        await flush();
        expect(await awaitTicket(t, 10)).toMatchObject({
            kind: 'done',
            settled: { ok: false, error: boom },
        });
    });
});

describe('deferred-action-results — streams', () => {
    beforeEach(() => {
        __resetPolledStore();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    /** A generator that yields each of `values`, waiting `gapMs` (fake time) between each. */
    async function* paced(values: number[], gapMs: number): AsyncGenerator<number> {
        for (const v of values) {
            await new Promise<void>((r) => setTimeout(r, gapMs));
            yield v;
        }
    }

    it('ends a segment with resume when the budget elapses mid-stream', async () => {
        const t = ticket();
        openStreamTicket(t, paced([1, 2, 3], 100), META, 1000);
        const seg = readStreamSegment<number>(t, 0, 50, 1000);
        const collecting = collect(seg);
        await vi.advanceTimersByTimeAsync(60);
        const events = await collecting;
        // No chunk arrived within 50ms, so the only event is resume.
        expect(events).toEqual([{ kind: 'resume' }]);
    });

    it('segments a fast stream by wall-clock, not idle (chunks faster than the budget)', async () => {
        // Regression: chunks every 100ms under a 250ms budget must still produce several segments —
        // an idle timeout would never fire here and one segment would swallow the whole stream.
        const t = ticket();
        openStreamTicket(t, paced([0, 1, 2, 3, 4, 5], 100), META, 10000);

        const got: number[] = [];
        let done = false;
        let segments = 0;
        for (let guard = 0; guard < 20 && !done; guard++) {
            segments++;
            const seg = readStreamSegment<number>(t, got.length, 250, 10000)!;
            const collecting = (async () => {
                for await (const e of seg) {
                    if (e.kind === 'chunk') got.push(e.chunk);
                    else if (e.kind === 'done') done = true;
                    else if (e.kind === 'error') throw e.error;
                }
            })();
            await vi.advanceTimersByTimeAsync(300);
            await collecting;
        }

        expect(got).toEqual([0, 1, 2, 3, 4, 5]);
        expect(segments).toBeGreaterThan(1); // actually broke into multiple segments
    });

    it('replays from the cursor and drops acknowledged chunks', async () => {
        const t = ticket();
        openStreamTicket(t, paced([10, 20, 30], 10), META, 1000);

        const seg1 = readStreamSegment<number>(t, 0, 1000, 1000);
        const got1 = collect(seg1);
        await vi.advanceTimersByTimeAsync(100);
        expect(await got1).toEqual([
            { kind: 'chunk', chunk: 10 },
            { kind: 'chunk', chunk: 20 },
            { kind: 'chunk', chunk: 30 },
            { kind: 'done' },
        ]);

        // A resume from index 2 must not replay 10/20 and must drop them from memory.
        const seg2 = readStreamSegment<number>(t, 2, 1000, 1000);
        const got2 = collect(seg2);
        await vi.advanceTimersByTimeAsync(10);
        expect(await got2).toEqual([{ kind: 'chunk', chunk: 30 }, { kind: 'done' }]);
    });

    it('re-fetches a lost segment from the same cursor', async () => {
        const t = ticket();
        openStreamTicket(t, paced([1, 2], 10), META, 1000);
        await vi.advanceTimersByTimeAsync(50); // let the generator finish

        const a = collect(readStreamSegment<number>(t, 0, 1000, 1000));
        await vi.advanceTimersByTimeAsync(1);
        const b = collect(readStreamSegment<number>(t, 0, 1000, 1000));
        await vi.advanceTimersByTimeAsync(1);
        expect(await a).toEqual(await b);
    });

    it('delivers error in a later segment', async () => {
        const t = ticket();
        async function* boom(): AsyncGenerator<number> {
            await new Promise<void>((r) => setTimeout(r, 10));
            yield 1;
            throw new Error('stream failed');
        }
        openStreamTicket(t, boom(), META, 1000);
        const events = collect(readStreamSegment<number>(t, 0, 1000, 1000));
        await vi.advanceTimersByTimeAsync(50);
        const result = await events;
        expect(result[0]).toEqual({ kind: 'chunk', chunk: 1 });
        expect(result[1]!.kind).toBe('error');
    });

    it('abandons a stream with no open segment after the abandon window', async () => {
        const t = ticket();
        const returnSpy = vi.fn();
        async function* forever(): AsyncGenerator<number> {
            try {
                for (let i = 0; ; i++) {
                    await new Promise<void>((r) => setTimeout(r, 10));
                    yield i;
                }
            } finally {
                returnSpy();
            }
        }
        openStreamTicket(t, forever(), META, 100);
        expect(__hasTicket(t)).toBe(true);
        // No segment ever opens; after the abandon window the ticket is dropped.
        await vi.advanceTimersByTimeAsync(150);
        expect(__hasTicket(t)).toBe(false);
        expect(returnSpy).toHaveBeenCalled();
    });

    it('returns undefined for an unknown ticket', () => {
        expect(readStreamSegment(ticket(), 0, 1000, 1000)).toBeUndefined();
    });
});
