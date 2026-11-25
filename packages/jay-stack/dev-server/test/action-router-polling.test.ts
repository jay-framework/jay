import { describe, it, expect, beforeEach } from 'vitest';
import { createActionRouter, createActionResultRouter } from '../lib/action-router';
import { ActionRegistry, issueSeed, __resetPolledStore } from '@jay-framework/stack-server-runtime';
import { makeJayAction, makeJayStream } from '@jay-framework/fullstack-component';

const BUDGET = 20;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ticket(counter = 0): string {
    return `${issueSeed()}.${counter}`;
}

function req(overrides: Partial<any> = {}) {
    return { method: 'POST', path: '/t.slow', query: {}, body: {}, headers: {}, ...overrides };
}

/** Mock express response that captures json, status, headers, and NDJSON writes. */
function res() {
    const r: any = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: null as any,
        written: [] as string[],
        ended: false,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: any) {
            this.body = data;
            return this;
        },
        set(h: string, v: string) {
            this.headers[h.toLowerCase()] = v;
            return this;
        },
        setHeader(h: string, v: string) {
            this.headers[h.toLowerCase()] = v;
            return this;
        },
        append(h: string, v: string) {
            this.headers[h.toLowerCase()] = v;
            return this;
        },
        write(s: string) {
            this.written.push(s);
            return true;
        },
        end() {
            this.ended = true;
            return this;
        },
    };
    return r;
}

function ndjsonLines(r: ReturnType<typeof res>): any[] {
    return r.written
        .join('')
        .split('\n')
        .filter((l: string) => l.trim())
        .map((l: string) => JSON.parse(l));
}

describe('dev action router — deferral (DL#239)', () => {
    let registry: ActionRegistry;
    let runs: number;

    beforeEach(() => {
        __resetPolledStore();
        runs = 0;
        registry = new ActionRegistry();
        registry.register(
            makeJayAction('t.slow').withHandler(async (input: { ms: number }) => {
                runs++;
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
    });

    async function pollUntilDone(t: string) {
        const resultRouter = createActionResultRouter({ registry, actionPollAfterMs: BUDGET });
        for (let i = 0; i < 100; i++) {
            const r = res();
            await resultRouter(
                req({ method: 'GET', path: `/${t}`, query: {} }) as any,
                r as any,
                () => {},
            );
            if (r.statusCode !== 202) return r;
            await sleep(5);
        }
        throw new Error('poll never completed');
    }

    it('returns 200 directly when the handler beats the budget', async () => {
        const router = createActionRouter({ registry, actionPollAfterMs: BUDGET });
        const r = res();
        await router(
            req({
                path: '/t.slow',
                body: { ms: 0 },
                headers: { 'jay-action-ticket': ticket() },
            }) as any,
            r as any,
            () => {},
        );
        expect(r.statusCode).toBe(200);
        expect(r.body).toEqual({ success: true, data: 'late' });
    });

    it('returns 202 past the budget, then delivers on poll', async () => {
        const t = ticket();
        const router = createActionRouter({ registry, actionPollAfterMs: BUDGET });
        const r = res();
        await router(
            req({ path: '/t.slow', body: { ms: 100 }, headers: { 'jay-action-ticket': t } }) as any,
            r as any,
            () => {},
        );
        expect(r.statusCode).toBe(202);
        expect(r.body).toEqual({ pending: { ticket: t } });
        expect(r.headers['cache-control']).toBe('private, no-store');

        const done = await pollUntilDone(t);
        expect(done.statusCode).toBe(200);
        expect(done.body).toEqual({ success: true, data: 'late' });
    });

    it('runs the handler once across a re-POST (attach)', async () => {
        const t = ticket();
        const router = createActionRouter({ registry, actionPollAfterMs: BUDGET });
        for (const _ of [0, 1]) {
            const r = res();
            await router(
                req({
                    path: '/t.slow',
                    body: { ms: 80 },
                    headers: { 'jay-action-ticket': t },
                }) as any,
                r as any,
                () => {},
            );
            expect(r.statusCode).toBe(202);
        }
        await pollUntilDone(t);
        expect(runs).toBe(1);
    });

    it('404s an unknown ticket on the result route', async () => {
        const resultRouter = createActionResultRouter({ registry, actionPollAfterMs: BUDGET });
        const r = res();
        await resultRouter(
            req({ method: 'GET', path: `/${ticket()}`, query: {} }) as any,
            r as any,
            () => {},
        );
        expect(r.statusCode).toBe(404);
        expect(r.body.error.code).toBe('RESULT_NOT_FOUND');
    });

    it('does not poll without a budget', async () => {
        const router = createActionRouter({ registry });
        const r = res();
        await router(
            req({
                path: '/t.slow',
                body: { ms: 0 },
                headers: { 'jay-action-ticket': ticket() },
            }) as any,
            r as any,
            () => {},
        );
        expect(r.statusCode).toBe(200);
    });

    it('streams resumable segments and reassembles chunks', async () => {
        const t = ticket();
        const router = createActionRouter({ registry, actionPollAfterMs: BUDGET });
        const first = res();
        await router(
            req({ path: '/t.ticker', body: { n: 5 }, headers: { 'jay-action-ticket': t } }) as any,
            first as any,
            () => {},
        );

        const chunks: number[] = [];
        let events = ndjsonLines(first);
        let done = false;
        const resultRouter = createActionResultRouter({ registry, actionPollAfterMs: BUDGET });
        for (let guard = 0; guard < 100 && !done; guard++) {
            for (const e of events) {
                if ('chunk' in e) chunks.push(e.chunk);
                else if (e.done) done = true;
                else if (e.error) throw new Error('stream error');
            }
            if (done) break;
            const r = res();
            await resultRouter(
                req({
                    method: 'GET',
                    path: `/${t}`,
                    query: { from: String(chunks.length) },
                }) as any,
                r as any,
                () => {},
            );
            events = ndjsonLines(r);
        }
        expect(done).toBe(true);
        expect(chunks).toEqual([0, 1, 2, 3, 4]);
    });
});
