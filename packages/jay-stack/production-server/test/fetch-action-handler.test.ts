import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ActionRegistry } from '@jay-framework/stack-server-runtime';
import {
    ActionError,
    makeJayAction,
    makeJayQuery,
    makeJayStream,
} from '@jay-framework/fullstack-component';
import { resetLogger, setLogger } from '@jay-framework/logger';
import { fetchActionRequest } from '../lib/serve/fetch-action-handler';

const SITE = 'http://site.example';

function post(name: string, headers: Record<string, string> = {}, body = '{}', base = SITE) {
    return new Request(`${base}/_jay/actions/${name}`, { method: 'POST', headers, body });
}

function cookieEcho(registry: ActionRegistry) {
    const calls: any[] = [];
    registry.register(
        makeJayAction('dl230.echo')
            .withRequest()
            .withHandler(async (input: {}, request) => {
                calls.push(request.cookies);
                return request.cookies.s;
            }),
    );
    return calls;
}

function cookieSetter(registry: ActionRegistry) {
    const calls: string[] = [];
    registry.register(
        makeJayAction('dl230.login')
            .withRequest()
            .withHandler(async (input: {}, request) => {
                calls.push('login');
                request.setCookie('sid', 'abc');
                request.setCookie('csrf', 'xyz', { httpOnly: false });
                return 'ok';
            }),
    );
    return calls;
}

describe('fetchActionRequest withRequest (DL#230)', () => {
    it('passes request cookies to the handler and sends private, no-store', async () => {
        const registry = new ActionRegistry();
        const calls = cookieEcho(registry);

        const response = await fetchActionRequest(
            post('dl230.echo', { cookie: 's=abc' }),
            registry,
        );

        expect(calls).toEqual([{ s: 'abc' }]);
        expect(await response.json()).toEqual({ success: true, data: 'abc' });
        expect(response.headers.get('cache-control')).toEqual('private, no-store');
    });

    it('rejects a cross-site POST with 403 before reading the body', async () => {
        const registry = new ActionRegistry();
        const calls = cookieEcho(registry);
        const request = post('dl230.echo', { 'sec-fetch-site': 'cross-site' }, 'not json');

        const response = await fetchActionRequest(request, registry);

        expect(response.status).toEqual(403);
        expect(await response.json()).toEqual({
            success: false,
            error: {
                code: 'CROSS_ORIGIN_REQUEST',
                message: "Action 'dl230.echo' rejected a cross-origin request",
                isActionError: false,
            },
        });
        expect(calls).toEqual([]);
        expect(request.bodyUsed).toEqual(false);
    });

    it('does not check origin for actions without withRequest', async () => {
        const registry = new ActionRegistry();
        registry.register(makeJayAction('dl230.plain').withHandler(async (input: {}) => 'ok'));

        const response = await fetchActionRequest(
            post('dl230.plain', { 'sec-fetch-site': 'cross-site' }),
            registry,
        );

        expect(response.status).toEqual(200);
        expect(response.headers.get('cache-control')).toEqual(null);
    });

    it('passes cookies to a streaming action and sends private, no-store', async () => {
        const registry = new ActionRegistry();
        registry.registerStream(
            makeJayStream('dl230.stream')
                .withRequest()
                .withHandler(async function* (input: {}, request) {
                    yield request.cookies.s;
                }),
        );

        const response = await fetchActionRequest(
            post('dl230.stream', { cookie: 's=abc' }),
            registry,
        );

        expect(await response.text()).toEqual('{"chunk":"abc"}\n{"done":true}\n');
        expect(response.headers.get('cache-control')).toEqual('private, no-store');
    });

    it('emits one Set-Cookie header per cookie', async () => {
        const registry = new ActionRegistry();
        cookieSetter(registry);

        const response = await fetchActionRequest(post('dl230.login'), registry);

        expect(response.headers.getSetCookie()).toEqual([
            'sid=abc; Path=/; HttpOnly; SameSite=Lax',
            'csrf=xyz; Path=/; SameSite=Lax',
        ]);
        expect(response.headers.get('cache-control')).toEqual('private, no-store');
    });

    it('marks cookies Secure when x-forwarded-proto is https', async () => {
        const registry = new ActionRegistry();
        cookieSetter(registry);

        const forwarded = await fetchActionRequest(
            post('dl230.login', { 'x-forwarded-proto': 'https' }),
            registry,
        );
        const plain = await fetchActionRequest(post('dl230.login'), registry);

        expect(forwarded.headers.getSetCookie()).toEqual([
            'sid=abc; Path=/; HttpOnly; SameSite=Lax; Secure',
            'csrf=xyz; Path=/; SameSite=Lax; Secure',
        ]);
        expect(plain.headers.getSetCookie()).toEqual([
            'sid=abc; Path=/; HttpOnly; SameSite=Lax',
            'csrf=xyz; Path=/; SameSite=Lax',
        ]);
    });

    it('never runs a cookie-setting handler for a cross-site POST', async () => {
        const registry = new ActionRegistry();
        const calls = cookieSetter(registry);

        const response = await fetchActionRequest(
            post('dl230.login', { origin: 'http://evil.example' }),
            registry,
        );

        expect(response.status).toEqual(403);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(calls).toEqual([]);
    });
});

function get(name: string, headers: Record<string, string> = {}) {
    return new Request(`${SITE}/_jay/actions/${name}`, { method: 'GET', headers });
}

/** A JSON body of exactly `byteLength` UTF-8 bytes, padded with `pad` (1 or 2 bytes per char). */
function jsonBodyOfBytes(byteLength: number, pad = 'a'): string {
    const envelopeBytes = '{"v":""}'.length;
    const padBytes = new TextEncoder().encode(pad).byteLength;
    const count = (byteLength - envelopeBytes) / padBytes;
    if (!Number.isInteger(count))
        throw new Error(`cannot pad to ${byteLength} bytes with '${pad}'`);
    return JSON.stringify({ v: pad.repeat(count) });
}

function chunkedPost(name: string, body: string, headers: Record<string, string> = {}) {
    const bytes = new TextEncoder().encode(body);
    const chunkSize = Math.max(7, Math.ceil(bytes.length / 16));
    const stream = new ReadableStream({
        start(controller) {
            for (let i = 0; i < bytes.length; i += chunkSize)
                controller.enqueue(bytes.slice(i, i + chunkSize));
            controller.close();
        },
    });
    return new Request(`${SITE}/_jay/actions/${name}`, {
        method: 'POST',
        headers,
        body: stream,
        duplex: 'half',
    } as RequestInit);
}

function echoAction(registry: ActionRegistry) {
    const calls: unknown[] = [];
    registry.register(
        makeJayAction('dl234.echo').withHandler(async (input: { v?: string }) => {
            calls.push(input);
            return input.v?.length ?? 0;
        }),
    );
    return calls;
}

const tooLarge = (limitBytes: number) => ({
    success: false,
    error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: `Action request body exceeds ${limitBytes} bytes`,
        isActionError: false,
    },
});

describe('fetchActionRequest body size cap (DL#234)', () => {
    it('should return 413 when Content-Length exceeds the limit', async () => {
        const registry = new ActionRegistry();
        const calls = echoAction(registry);
        const body = jsonBodyOfBytes(40);
        const request = post('dl234.echo', { 'content-length': '40' }, body);

        const response = await fetchActionRequest(request, registry, {
            actionBodyLimitBytes: 32,
        });

        expect(response.status).toEqual(413);
        expect(await response.json()).toEqual(tooLarge(32));
        expect(calls).toEqual([]);
        expect(request.bodyUsed).toEqual(false);
    });

    it('should return 413 when a chunked body exceeds the limit without Content-Length', async () => {
        const registry = new ActionRegistry();
        const calls = echoAction(registry);

        const response = await fetchActionRequest(
            chunkedPost('dl234.echo', jsonBodyOfBytes(40)),
            registry,
            { actionBodyLimitBytes: 32 },
        );

        expect(response.status).toEqual(413);
        expect(await response.json()).toEqual(tooLarge(32));
        expect(calls).toEqual([]);
    });

    it('should accept a body exactly at the limit', async () => {
        const registry = new ActionRegistry();
        echoAction(registry);

        const response = await fetchActionRequest(
            chunkedPost('dl234.echo', jsonBodyOfBytes(32)),
            registry,
            { actionBodyLimitBytes: 32 },
        );

        expect(await response.json()).toEqual({ success: true, data: 24 });
    });

    it('should accept a multi-byte body exactly at the limit in bytes and reject it one byte over', async () => {
        const registry = new ActionRegistry();
        echoAction(registry);
        const atLimit = jsonBodyOfBytes(32, 'é');
        const overLimit = jsonBodyOfBytes(32, 'é').replace('{"v"', '{"vv"');

        const accepted = await fetchActionRequest(chunkedPost('dl234.echo', atLimit), registry, {
            actionBodyLimitBytes: 32,
        });
        const rejected = await fetchActionRequest(chunkedPost('dl234.echo', overLimit), registry, {
            actionBodyLimitBytes: 32,
        });

        expect(await accepted.json()).toEqual({ success: true, data: 12 });
        expect(rejected.status).toEqual(413);
    });

    it('should enforce the 1 MiB default limit', async () => {
        const registry = new ActionRegistry();
        echoAction(registry);

        const atDefault = await fetchActionRequest(
            chunkedPost('dl234.echo', jsonBodyOfBytes(1_048_576)),
            registry,
        );
        const overDefault = await fetchActionRequest(
            chunkedPost('dl234.echo', jsonBodyOfBytes(1_048_578)),
            registry,
        );

        expect(atDefault.status).toEqual(200);
        expect(overDefault.status).toEqual(413);
        expect(await overDefault.json()).toEqual(tooLarge(1_048_576));
    });

    it('should honour a configured actionBodyLimitBytes', async () => {
        const registry = new ActionRegistry();
        echoAction(registry);
        const twoMiB = jsonBodyOfBytes(2 * 1_048_576);

        const response = await fetchActionRequest(chunkedPost('dl234.echo', twoMiB), registry, {
            actionBodyLimitBytes: 5 * 1_048_576,
        });

        expect(response.status).toEqual(200);
    });

    it('should treat a null request.body as {}', async () => {
        const registry = new ActionRegistry();
        const calls = echoAction(registry);
        const request = new Request(`${SITE}/_jay/actions/dl234.echo`, { method: 'POST' });

        const response = await fetchActionRequest(request, registry);

        expect(response.status).toEqual(200);
        expect(calls).toEqual([{}]);
    });

    it.each(['abc', '-1'])(
        'should ignore an invalid Content-Length (%s) and enforce the cap while streaming',
        async (contentLength) => {
            const registry = new ActionRegistry();
            const calls = echoAction(registry);

            const rejected = await fetchActionRequest(
                chunkedPost('dl234.echo', jsonBodyOfBytes(40), { 'content-length': contentLength }),
                registry,
                { actionBodyLimitBytes: 32 },
            );
            const accepted = await fetchActionRequest(
                chunkedPost('dl234.echo', jsonBodyOfBytes(32), { 'content-length': contentLength }),
                registry,
                { actionBodyLimitBytes: 32 },
            );

            expect(rejected.status).toEqual(413);
            expect(accepted.status).toEqual(200);
            expect(calls).toEqual([{ v: 'a'.repeat(24) }]);
        },
    );
});

describe('fetchActionRequest internal error redaction (DL#234)', () => {
    let errors: unknown[][];

    beforeEach(() => {
        errors = [];
        setLogger({
            important: () => {},
            info: () => {},
            warn: () => {},
            error: (...args: unknown[]) => errors.push(args),
        });
    });

    afterEach(() => resetLogger());

    function loggedError(actionName: string, thrown: Error): unknown[][] {
        return [[`[Action] ${actionName} failed: ${thrown.message}\n${thrown.stack}`]];
    }

    function failingAction(registry: ActionRegistry, thrown: Error) {
        registry.register(
            makeJayAction('dl234.fail').withHandler(async () => {
                throw thrown;
            }),
        );
    }

    it('should return a generic message for a non-ActionError throw in production', async () => {
        const registry = new ActionRegistry();
        const thrown = new Error('secret https://internal.example/x');
        failingAction(registry, thrown);

        const response = await fetchActionRequest(post('dl234.fail'), registry);

        expect(response.status).toEqual(500);
        expect(await response.json()).toEqual({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
                isActionError: false,
            },
        });
        expect(errors).toEqual(loggedError('dl234.fail', thrown));
    });

    it('should log the stack of the original error', async () => {
        const registry = new ActionRegistry();
        const thrown = new Error('secret');
        failingAction(registry, thrown);

        await fetchActionRequest(post('dl234.fail'), registry);

        expect(errors).toEqual(loggedError('dl234.fail', thrown));
    });

    it('should never serialize the error cause', async () => {
        const registry = new ActionRegistry();
        failingAction(registry, new Error('secret'));

        const response = await fetchActionRequest(post('dl234.fail'), registry);

        expect(Object.keys(await response.json())).toEqual(['success', 'error']);
    });

    it('should return ActionError code and message unchanged', async () => {
        const registry = new ActionRegistry();
        failingAction(registry, new ActionError('OUT_OF_STOCK', 'This item is sold out'));

        const response = await fetchActionRequest(post('dl234.fail'), registry);

        expect(response.status).toEqual(422);
        expect(await response.json()).toEqual({
            success: false,
            error: { code: 'OUT_OF_STOCK', message: 'This item is sold out', isActionError: true },
        });
        expect(errors).toEqual([]);
    });

    it('should return a generic error frame for a streaming action throw', async () => {
        const registry = new ActionRegistry();
        const streamError = new Error('secret stream');
        registry.registerStream(
            makeJayStream('dl234.stream').withHandler(async function* () {
                yield 1;
                throw streamError;
            }),
        );

        const response = await fetchActionRequest(post('dl234.stream'), registry);

        expect(await response.text()).toEqual('{"chunk":1}\n{"error":"Internal server error"}\n');
        expect(errors).toEqual(loggedError('dl234.stream', streamError));
    });

    it('should keep the ActionError message in a streaming error frame', async () => {
        const registry = new ActionRegistry();
        registry.registerStream(
            makeJayStream('dl234.stream').withHandler(async function* () {
                throw new ActionError('OUT_OF_STOCK', 'This item is sold out');
            }),
        );

        const response = await fetchActionRequest(post('dl234.stream'), registry);

        expect(await response.text()).toEqual('{"error":"This item is sold out"}\n');
    });
});

describe('fetchActionRequest GET withRequest (DL#234)', () => {
    function cookieQuery(registry: ActionRegistry) {
        const calls: string[] = [];
        registry.register(
            makeJayQuery('dl234.cart')
                .withRequest()
                .withHandler(async (input: {}, request) => {
                    calls.push('cart');
                    return request.cookies.s ?? null;
                }),
        );
        return calls;
    }

    it('should reject a GET withRequest action on a cross-site navigation', async () => {
        const registry = new ActionRegistry();
        const calls = cookieQuery(registry);

        const response = await fetchActionRequest(
            get('dl234.cart', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }),
            registry,
        );

        expect(response.status).toEqual(403);
        expect((await response.json()).error.code).toEqual('CROSS_ORIGIN_REQUEST');
        expect(calls).toEqual([]);
    });

    it('should allow a GET withRequest action from same-origin', async () => {
        const registry = new ActionRegistry();
        cookieQuery(registry);

        const response = await fetchActionRequest(
            get('dl234.cart', { 'sec-fetch-site': 'same-origin', cookie: 's=abc' }),
            registry,
        );

        expect(await response.json()).toEqual({ success: true, data: 'abc' });
    });

    it('should allow a GET withRequest action from a client without Sec-Fetch-Site/Origin', async () => {
        const registry = new ActionRegistry();
        cookieQuery(registry);

        const response = await fetchActionRequest(get('dl234.cart'), registry);

        expect(response.status).toEqual(200);
    });

    it('should still allow a GET action without withRequest cross-origin', async () => {
        const registry = new ActionRegistry();
        registry.register(makeJayQuery('dl234.plain').withHandler(async (input: {}) => 'ok'));

        const response = await fetchActionRequest(
            get('dl234.plain', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }),
            registry,
        );

        expect(response.status).toEqual(200);
    });

    /**
     * Bug: a malformed Cookie header throws URIError (DL#234 Problem #3).
     * Expected: the action runs with the raw value. Actual: the request fails.
     */
    it('should not throw on a malformed cookie', async () => {
        const registry = new ActionRegistry();
        cookieQuery(registry);

        const response = await fetchActionRequest(
            get('dl234.cart', { cookie: 's=%E0%A4%A' }),
            registry,
        );

        expect(await response.json()).toEqual({ success: true, data: '%E0%A4%A' });
    });
});
