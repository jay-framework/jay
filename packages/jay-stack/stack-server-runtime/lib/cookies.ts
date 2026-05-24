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
