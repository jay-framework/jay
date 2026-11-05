import { describe, it, expect } from 'vitest';
import { ActionRegistry } from '@jay-framework/stack-server-runtime';
import { makeJayAction, makeJayStream } from '@jay-framework/fullstack-component';
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
