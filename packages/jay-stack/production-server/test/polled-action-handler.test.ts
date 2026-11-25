import { describe, it, expect, beforeEach } from 'vitest';
import { ActionRegistry, issueSeed, __resetPolledStore } from '@jay-framework/stack-server-runtime';
import { makeJayAction, makeJayQuery, makeJayStream } from '@jay-framework/fullstack-component';
import {
    fetchActionRequest,
    fetchActionResultRequest,
    isActionResultRequest,
} from '../lib/serve/fetch-action-handler';

const SITE = 'http://site.example';
const BUDGET = 20;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ticket(counter = 0): string {
    return `${issueSeed()}.${counter}`;
}

function postWithTicket(name: string, t: string, body = '{}') {
    return new Request(`${SITE}/_jay/actions/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'jay-action-ticket': t },
        body,
    });
}

function pollReq(t: string, from?: number) {
    const q = from === undefined ? '' : `?from=${from}`;
    return new Request(`${SITE}/_jay/action-results/${t}${q}`, { method: 'GET' });
}

/** Polls until the result is no longer 202, or gives up. */
async function pollUntilDone(registry: ActionRegistry, t: string) {
    for (let i = 0; i < 100; i++) {
        const res = await fetchActionResultRequest(pollReq(t), registry, {
            actionPollAfterMs: BUDGET,
        });
        if (res.status !== 202) return res;
        await sleep(5);
    }
    throw new Error('poll never completed');
}

async function readNdjson(res: Response): Promise<any[]> {
    const text = await res.text();
    return text
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
}

describe('deferred actions (DL#239)', () => {
    let registry: ActionRegistry;
    let runCount: number;

    beforeEach(() => {
        __resetPolledStore();
        runCount = 0;
        registry = new ActionRegistry();
        registry.register(
            makeJayAction('t.slow').withHandler(async (input: { ms: number }) => {
                runCount++;
                await sleep(input.ms);
                return 'late';
            }),
        );
        registry.registerStream(
            makeJayStream('t.ticker').withHandler(async function* (input: { n: number }) {
                for (let i = 0; i < input.n; i++) {
                    await sleep(10);
                    yield i;
                }
            }),
        );
        registry.register(
            makeJayQuery('t.cached')
                .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
                .withHandler(async (input: {}) => 'fast'),
        );
    });

    it('keeps normal cache headers when a cacheable GET finishes within budget', async () => {
        const res = await fetchActionRequest(
            new Request(`${SITE}/_jay/actions/t.cached`, {
                method: 'GET',
                headers: { 'jay-action-ticket': ticket() },
            }),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(res.status).toBe(200);
        // Not polled (returned in time) → today's cache header, NOT no-store.
        expect(res.headers.get('cache-control')).toBe('max-age=60, stale-while-revalidate=120');
    });

    it('isActionResultRequest matches only the poll route', () => {
        expect(isActionResultRequest('/_jay/action-results/abc')).toBe(true);
        expect(isActionResultRequest('/_jay/actions/t.slow')).toBe(false);
    });

    it('returns 200 directly when the handler beats the budget', async () => {
        const res = await fetchActionRequest(
            postWithTicket('t.slow', ticket(), JSON.stringify({ ms: 0 })),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: 'late' });
    });

    it('returns 202 + ticket past the budget, then delivers on poll', async () => {
        const t = ticket();
        const res = await fetchActionRequest(
            postWithTicket('t.slow', t, JSON.stringify({ ms: 100 })),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(res.status).toBe(202);
        expect(res.headers.get('cache-control')).toBe('private, no-store');
        expect(await res.json()).toEqual({ pending: { ticket: t } });

        const done = await pollUntilDone(registry, t);
        expect(done.status).toBe(200);
        expect(await done.json()).toEqual({ success: true, data: 'late' });
    });

    it('runs the handler once when the client re-POSTs after a 202 (attach)', async () => {
        const t = ticket();
        const first = await fetchActionRequest(
            postWithTicket('t.slow', t, JSON.stringify({ ms: 80 })),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(first.status).toBe(202);
        // Re-POST the same ticket (as a client would after a 504 on the first POST).
        const second = await fetchActionRequest(
            postWithTicket('t.slow', t, JSON.stringify({ ms: 80 })),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(second.status).toBe(202);

        await pollUntilDone(registry, t);
        expect(runCount).toBe(1);
    });

    it('404 RESULT_NOT_FOUND for an unknown or bad-MAC ticket', async () => {
        const unknown = await fetchActionResultRequest(pollReq(ticket()), registry, {
            actionPollAfterMs: BUDGET,
        });
        expect(unknown.status).toBe(404);
        expect((await unknown.json()).error.code).toBe('RESULT_NOT_FOUND');

        const bad = await fetchActionResultRequest(pollReq('nonce.badmac.0'), registry, {
            actionPollAfterMs: BUDGET,
        });
        expect(bad.status).toBe(404);
    });

    it('does not poll when the ticket is absent or invalid (runs inline)', async () => {
        const res = await fetchActionRequest(
            new Request(`${SITE}/_jay/actions/t.slow`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ms: 0 }),
            }),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: 'late' });
    });

    it('does not poll when no budget is configured', async () => {
        const res = await fetchActionRequest(
            postWithTicket('t.slow', ticket(), JSON.stringify({ ms: 0 })),
            registry,
        );
        expect(res.status).toBe(200);
    });

    it('streams in resumable segments and reassembles every chunk in order', async () => {
        const t = ticket();
        const first = await fetchActionRequest(
            postWithTicket('t.ticker', t, JSON.stringify({ n: 5 })),
            registry,
            { actionPollAfterMs: BUDGET },
        );
        expect(first.headers.get('content-type')).toContain('application/x-ndjson');

        const chunks: number[] = [];
        let events = await readNdjson(first);
        let done = false;
        for (let guard = 0; guard < 100 && !done; guard++) {
            for (const e of events) {
                if ('chunk' in e) chunks.push(e.chunk);
                else if (e.done) done = true;
                else if (e.error) throw new Error('unexpected stream error');
            }
            if (done) break;
            const next = await fetchActionResultRequest(pollReq(t, chunks.length), registry, {
                actionPollAfterMs: BUDGET,
            });
            events = await readNdjson(next);
        }
        expect(done).toBe(true);
        expect(chunks).toEqual([0, 1, 2, 3, 4]);
    });
});
