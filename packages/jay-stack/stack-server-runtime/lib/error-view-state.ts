/**
 * Shared error-page helpers (DL#218), target-agnostic so both the production server and the dev
 * server inject the `error` ViewState identically. An error page runs no author fast phase — the
 * framework passes the error details through as the fast contribution under the reserved `error`
 * key (Q6), with `jay.error.*` also exposed untyped via `__jay`.
 */

/** Error details assembled from a `RenderResult` or framework defaults, fed to an error page. */
export interface ErrorInfo {
    status: number;
    /** The path that errored (surfaces as `error.url`). */
    url: string;
    /** Human-facing heading; defaults per status when omitted. */
    title?: string;
    /** Descriptive text; defaults per status when omitted. */
    message?: string;
    /** Machine-readable code; defaults to `''` when omitted (contract field is required). */
    code?: string;
    /** Structured detail, projected to the forEach-able `error.details` `[{ key, value }]`. */
    details?: Record<string, unknown>;
}

const DEFAULT_TITLES: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Page Not Found',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
};

const DEFAULT_MESSAGES: Record<number, string> = {
    400: 'The request could not be understood.',
    401: 'You need to sign in to view this page.',
    403: 'You do not have permission to view this page.',
    404: 'The page you are looking for could not be found.',
    408: 'The request took too long. Please try again.',
    429: 'Too many requests. Please slow down and try again.',
    500: 'Something went wrong on our end.',
    502: 'We received an invalid response from an upstream service.',
    503: 'The service is temporarily unavailable. Please try again later.',
    504: 'An upstream service took too long to respond.',
};

/** Per-status default heading; falls back to a family-level title (4xx/5xx) then a generic one. */
export function defaultErrorTitle(status: number): string {
    if (DEFAULT_TITLES[status]) return DEFAULT_TITLES[status];
    if (status >= 400 && status < 500) return 'Request Error';
    if (status >= 500 && status < 600) return 'Server Error';
    return 'Error';
}

/** Per-status default message; falls back to a family-level message then a generic one. */
export function defaultErrorMessage(status: number): string {
    if (DEFAULT_MESSAGES[status]) return DEFAULT_MESSAGES[status];
    if (status >= 400 && status < 500) return 'Something went wrong with your request.';
    if (status >= 500 && status < 600) return 'Something went wrong on our end.';
    return 'An error occurred.';
}

/**
 * Resolve a status to an error-page token via the exact → family chain (DL#218). Returns the
 * matching key present in `tokens`, or undefined (caller falls back to plain text). v1 only
 * resolves 4xx/5xx; other statuses never get an error page.
 */
export function resolveErrorPageToken(
    tokens: Iterable<string>,
    status: number,
): string | undefined {
    if (status < 400 || status > 599) return undefined;
    const set = tokens instanceof Set ? tokens : new Set(tokens);
    const exact = String(status);
    if (set.has(exact)) return exact;
    const family = `${Math.floor(status / 100)}xx`;
    if (set.has(family)) return family;
    return undefined;
}

/**
 * Build the ViewState for an error page: the injected `error` key plus `__jay.error` (untyped
 * convenience), merged over any pre-rendered static chrome. `details` is projected from the
 * `RenderResult.details` record to the forEach-able `[{ key, value }]` list; `code` defaults to
 * `''` (the contract field is required, DL#218 Phase 2.1).
 */
export function buildErrorViewState(info: ErrorInfo, slowViewState: object = {}): object {
    const error = {
        status: info.status,
        title: info.title ?? defaultErrorTitle(info.status),
        message: info.message ?? defaultErrorMessage(info.status),
        url: info.url,
        code: info.code ?? '',
        details: Object.entries(info.details ?? {}).map(([key, value]) => ({
            key,
            value: String(value),
        })),
    };
    const vs = { ...slowViewState } as Record<string, unknown>;
    vs.error = error;
    vs.__jay = { params: {}, url: { path: info.url }, error };
    return vs;
}
