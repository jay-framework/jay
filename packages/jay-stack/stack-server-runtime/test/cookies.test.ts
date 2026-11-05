import { describe, it, expect } from 'vitest';
import { serializeSetCookie } from '../lib/cookies';
import { createActionRequest } from '../lib/action-request';

describe('serializeSetCookie (DL#230)', () => {
    it('serializes defaults on a secure request', () => {
        expect(serializeSetCookie('sid', 'a b', {}, true)).toEqual(
            'sid=a%20b; Path=/; HttpOnly; SameSite=Lax; Secure',
        );
    });

    it('serializes explicit options in a fixed attribute order', () => {
        expect(
            serializeSetCookie(
                'sid',
                'v',
                {
                    maxAge: 3600,
                    domain: 'example.com',
                    sameSite: 'Strict',
                    httpOnly: false,
                    expires: new Date(Date.UTC(2030, 0, 1)),
                },
                false,
            ),
        ).toEqual(
            'sid=v; Path=/; Domain=example.com; Max-Age=3600; Expires=Tue, 01 Jan 2030 00:00:00 GMT; SameSite=Strict',
        );
    });

    it('forces Secure for SameSite=None', () => {
        expect(serializeSetCookie('sid', 'v', { sameSite: 'None', secure: false }, false)).toEqual(
            'sid=v; Path=/; HttpOnly; SameSite=None; Secure',
        );
    });

    it('throws on an invalid cookie name', () => {
        expect(() => serializeSetCookie('a;b', 'v', {}, false)).toThrow(TypeError);
    });
});

describe('createActionRequest (DL#230)', () => {
    it('clearCookie emits an expired cookie with the same path', () => {
        const request = createActionRequest({ cookies: {}, secure: false });
        request.clearCookie('sid', { path: '/x' });
        expect(request.collectSetCookies()).toEqual([
            'sid=; Path=/x; Max-Age=0; HttpOnly; SameSite=Lax',
        ]);
    });

    it('clearCookie adds Secure on https', () => {
        const request = createActionRequest({ cookies: {}, secure: true });
        request.clearCookie('sid', { path: '/x' });
        expect(request.collectSetCookies()).toEqual([
            'sid=; Path=/x; Max-Age=0; HttpOnly; SameSite=Lax; Secure',
        ]);
    });

    it('exposes frozen cookies', () => {
        const request = createActionRequest({ cookies: { s: '1' }, secure: false });
        expect(Object.isFrozen(request.cookies)).toEqual(true);
        expect(request.cookies).toEqual({ s: '1' });
    });
});
