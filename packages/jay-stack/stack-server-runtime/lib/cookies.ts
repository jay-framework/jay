import type { CookieOptions } from '@jay-framework/fullstack-component';

/**
 * Parse a Cookie header string into a key-value record.
 * Handles standard cookie format: "name1=value1; name2=value2".
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    for (const pair of cookieHeader.split(';')) {
        const [name, ...rest] = pair.trim().split('=');
        if (name) cookies[name] = decodeURIComponent(rest.join('='));
    }
    return cookies;
}

/** RFC 6265 cookie-name token: visible ASCII except separators. */
const COOKIE_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Serialize a `Set-Cookie` header value (DL#229).
 * Defaults: HttpOnly, SameSite=Lax, Path=/, Secure when the request is https.
 * The value is URI-encoded, mirroring the decoding in parseCookies.
 */
export function serializeSetCookie(
    name: string,
    value: string,
    options: CookieOptions,
    isSecureRequest: boolean,
): string {
    if (!COOKIE_NAME_TOKEN.test(name)) {
        throw new TypeError(`Invalid cookie name '${name}': must be an RFC 6265 token`);
    }
    const sameSite = options.sameSite ?? 'Lax';
    const secure = sameSite === 'None' || (options.secure ?? isSecureRequest);
    const attributes = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`];
    if (options.domain) attributes.push(`Domain=${options.domain}`);
    if (options.maxAge !== undefined) attributes.push(`Max-Age=${Math.floor(options.maxAge)}`);
    if (options.expires) attributes.push(`Expires=${options.expires.toUTCString()}`);
    if (options.httpOnly ?? true) attributes.push('HttpOnly');
    attributes.push(`SameSite=${sameSite}`);
    if (secure) attributes.push('Secure');
    return attributes.join('; ');
}

/**
 * Whether a request arrived over https: the URL protocol, or the first `x-forwarded-proto` value.
 * The header can only upgrade to secure, so a spoofed value only makes cookies stricter (DL#229 Q11).
 */
export function isSecureRequest(
    protocol: string,
    forwardedProto: string | null | undefined,
): boolean {
    const normalizedProtocol = protocol.replace(/:$/, '').toLowerCase();
    const firstForwarded = forwardedProto?.split(',')[0]?.trim().toLowerCase();
    return normalizedProtocol === 'https' || firstForwarded === 'https';
}
