import type { ActionRequest, CookieOptions } from '@jay-framework/fullstack-component';
import { serializeSetCookie } from './cookies';

/** What an HTTP entry point knows about the incoming request (DL#230). */
export interface IncomingRequest {
    cookies: Record<string, string>;
    secure: boolean;
}

export const NO_INCOMING_REQUEST: IncomingRequest = Object.freeze({
    cookies: Object.freeze({}),
    secure: false,
});

/** An ActionRequest for one handler invocation, which collects the cookies it sets. */
export interface CollectingActionRequest extends ActionRequest {
    /** The serialized Set-Cookie values, one per cookie name (last write wins). */
    collectSetCookies(): string[];
}

export function createActionRequest(incoming: IncomingRequest): CollectingActionRequest {
    const setCookies = new Map<string, string>();
    const setCookie = (name: string, value: string, options: CookieOptions = {}) => {
        setCookies.set(name, serializeSetCookie(name, value, options, incoming.secure));
    };
    return {
        cookies: Object.freeze({ ...incoming.cookies }),
        setCookie,
        clearCookie: (name, options = {}) =>
            setCookie(name, '', { path: options.path, domain: options.domain, maxAge: 0 }),
        collectSetCookies: () => [...setCookies.values()],
    };
}
