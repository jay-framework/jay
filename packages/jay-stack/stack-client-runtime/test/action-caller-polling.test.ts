import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createActionCaller,
    createStreamCaller,
    setActionCallerOptions,
    ActionError,
} from '../lib/action-caller';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Installs a signed-looking seed so the client derives tickets (server MAC isn't checked here). */
function withSeed(seed = 'nonce.mac') {
    (globalThis as any).__jay = { actionSeed: seed };
}
function clearSeed() {
    delete (globalThis as any).__jay;
}

function jsonResponse(body: unknown, status = 200) {
    return { status, ok: status >= 200 && status < 300, json: async () => body };
}

/** An NDJSON Response built from literal lines, as the stream poll route returns. */
function ndjsonResponse(lines: object[], status = 200) {
    const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    return {
        status,
        ok: status >= 200 && status < 300,
        body: new Response(text).body,
    };
}

describe('deferred action caller (DL#239)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        setActionCallerOptions({ baseUrl: '', headers: {}, timeout: 30000 });
        withSeed();
    });
    afterEach(() => {
        clearSeed();
        vi.useRealTimers();
    });

    it('sends the ticket header and resolves a direct 200 normally', async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: 'ok' }));
        const call = createActionCaller<{}, string>('t.a', 'POST');
        expect(await call({})).toBe('ok');
        const [, init] = mockFetch.mock.calls[0];
        expect(init.headers['Jay-Action-Ticket']).toMatch(/^nonce\.mac\.\d+$/);
    });

    it('polls after a 202 until the result is ready', async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({ pending: { ticket: 't' } }, 202))
            .mockResolvedValueOnce(jsonResponse({ pending: { ticket: 't' } }, 202))
            .mockResolvedValueOnce(jsonResponse({ success: true, data: 42 }));
        const call = createActionCaller<{}, number>('t.a', 'POST');
        expect(await call({})).toBe(42);
        expect(mockFetch).toHaveBeenCalledTimes(3);
        // The first poll targets the result route.
        expect(mockFetch.mock.calls[1][0]).toContain('/_jay/action-results/');
    });

    it('resumes to polling after a 504 on the POST', async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({}, 504))
            .mockResolvedValueOnce(jsonResponse({ success: true, data: 'recovered' }));
        const call = createActionCaller<{}, string>('t.a', 'POST');
        expect(await call({})).toBe('recovered');
        expect(mockFetch.mock.calls[1][0]).toContain('/_jay/action-results/');
    });

    it('resumes to polling after a network error on the POST', async () => {
        mockFetch
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(jsonResponse({ success: true, data: 'recovered' }));
        const call = createActionCaller<{}, string>('t.a', 'POST');
        expect(await call({})).toBe('recovered');
    });

    it('throws RESULT_NOT_FOUND when a poll returns 404', async () => {
        mockFetch
            .mockResolvedValueOnce(jsonResponse({ pending: { ticket: 't' } }, 202))
            .mockResolvedValueOnce(jsonResponse({ success: false }, 404));
        const call = createActionCaller<{}, string>('t.a', 'POST');
        await expect(call({})).rejects.toMatchObject({ code: 'RESULT_NOT_FOUND' });
    });

    it('does not send a ticket or poll when there is no seed', async () => {
        clearSeed();
        mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: 'x' }));
        const call = createActionCaller<{}, string>('t.a', 'POST');
        expect(await call({})).toBe('x');
        const [, init] = mockFetch.mock.calls[0];
        expect(init.headers['Jay-Action-Ticket']).toBeUndefined();
    });

    it('times out across polls, not per request', async () => {
        setActionCallerOptions({ timeout: 0 });
        mockFetch.mockResolvedValue(jsonResponse({ pending: { ticket: 't' } }, 202));
        const call = createActionCaller<{}, string>('t.a', 'POST');
        await expect(call({})).rejects.toMatchObject({ code: 'TIMEOUT' });
    });
});

describe('deferred stream caller (DL#239)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        setActionCallerOptions({ baseUrl: '', headers: {}, timeout: 30000 });
        withSeed();
    });
    afterEach(() => clearSeed());

    async function drain<T>(it: AsyncIterable<T>): Promise<T[]> {
        const out: T[] = [];
        for await (const v of it) out.push(v);
        return out;
    }

    it('reassembles chunks across a resume segment', async () => {
        mockFetch
            .mockResolvedValueOnce(ndjsonResponse([{ chunk: 1 }, { chunk: 2 }, { resume: true }]))
            .mockResolvedValueOnce(ndjsonResponse([{ chunk: 3 }, { done: true }]));
        const stream = createStreamCaller<{}, number>('t.s');
        expect(await drain(stream({}))).toEqual([1, 2, 3]);
        // The resume targets the cursor the client reached.
        expect(mockFetch.mock.calls[1][0]).toContain('/_jay/action-results/');
        expect(mockFetch.mock.calls[1][0]).toContain('from=2');
    });

    it('resumes from the cursor after a cut segment (non-ok)', async () => {
        mockFetch
            .mockResolvedValueOnce(ndjsonResponse([{ chunk: 1 }]))
            .mockResolvedValueOnce(ndjsonResponse([], 504))
            .mockResolvedValueOnce(ndjsonResponse([{ chunk: 2 }, { done: true }]));
        const stream = createStreamCaller<{}, number>('t.s');
        expect(await drain(stream({}))).toEqual([1, 2]);
    });

    it('surfaces a stream error', async () => {
        mockFetch.mockResolvedValueOnce(ndjsonResponse([{ chunk: 1 }, { error: 'boom' }]));
        const stream = createStreamCaller<{}, number>('t.s');
        await expect(drain(stream({}))).rejects.toMatchObject({ code: 'STREAM_ERROR' });
    });

    it('treats an unexpected end with no ticket as an error', async () => {
        clearSeed();
        mockFetch.mockResolvedValueOnce(ndjsonResponse([{ chunk: 1 }])); // no done line
        const stream = createStreamCaller<{}, number>('t.s');
        await expect(drain(stream({}))).rejects.toMatchObject({ code: 'STREAM_ERROR' });
    });
});
