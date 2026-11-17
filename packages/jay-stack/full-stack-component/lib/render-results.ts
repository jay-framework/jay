import {
    ClientError4xx,
    HeadTag,
    PhaseOutput,
    Redirect3xx,
    ServerError5xx,
} from './jay-stack-types';

// ============================================================================
// Error Constructors
// ============================================================================

/**
 * Options for the human-facing / structured fields of an error outcome (Design Log #218).
 * `title` renders as the error page's heading (`error.title`); `message` as `error.message`;
 * `details` is projected to the forEach-able `error.details` key/value list.
 */
export interface ErrorOptions {
    title?: string;
    code?: string;
    details?: Record<string, unknown>;
}

export function serverError5xx(
    status: number,
    message?: string,
    opts?: ErrorOptions,
): ServerError5xx {
    return {
        kind: 'ServerError',
        status,
        message,
        ...(opts?.title !== undefined && { title: opts.title }),
        ...(opts?.code !== undefined && { code: opts.code }),
        ...(opts?.details !== undefined && { details: opts.details }),
    };
}

export function clientError4xx(
    status: number,
    message?: string,
    opts?: ErrorOptions,
): ClientError4xx {
    return {
        kind: 'ClientError',
        status,
        message,
        ...(opts?.title !== undefined && { title: opts.title }),
        ...(opts?.code !== undefined && { code: opts.code }),
        ...(opts?.details !== undefined && { details: opts.details }),
    };
}

export function notFound(message?: string, opts?: ErrorOptions): ClientError4xx {
    return clientError4xx(404, message, opts);
}

export function badRequest(message?: string, opts?: ErrorOptions): ClientError4xx {
    return clientError4xx(400, message, opts);
}

export function unauthorized(message?: string, opts?: ErrorOptions): ClientError4xx {
    return clientError4xx(401, message, opts);
}

export function forbidden(message?: string, opts?: ErrorOptions): ClientError4xx {
    return clientError4xx(403, message, opts);
}

export function redirect3xx(status: number, location: string, message?: string): Redirect3xx {
    return {
        kind: 'Redirect',
        status,
        location,
        message,
    };
}

// ============================================================================
// Success Constructors
// ============================================================================

/**
 * Create a successful phase output with rendered ViewState and carry-forward data.
 * Optionally include head tags to inject into <head> during SSR (Design Log #127).
 */
export function phaseOutput<ViewState extends object, CarryForward = {}>(
    rendered: ViewState,
    carryForward: CarryForward,
    options?: PhaseOutputOptions,
): PhaseOutput<ViewState, CarryForward> {
    return {
        kind: 'PhaseOutput',
        rendered,
        carryForward,
        ...(options?.headTags && { headTags: options.headTags }),
        ...(options?.responseHeaders && { responseHeaders: options.responseHeaders }),
        ...(options?.ttl != null && { ttl: options.ttl }),
        ...(options?.grace != null && { grace: options.grace }),
    };
}

/** Optional extras of a phase output (head tags, response headers, slow-phase freshness #226). */
export interface PhaseOutputOptions {
    headTags?: HeadTag[];
    responseHeaders?: Record<string, string>;
    /** Slow phase only: freshness lifetime in seconds (Design Log #226). */
    ttl?: number | null;
    /** Slow phase only: absolute age in seconds up to which stale data is served immediately (#226). */
    grace?: number | null;
}

/**
 * @deprecated Use phaseOutput instead. Kept for backwards compatibility.
 */
export function partialRender<ViewState extends object, CarryForward>(
    rendered: ViewState,
    carryForward: CarryForward,
): PhaseOutput<ViewState, CarryForward> {
    return phaseOutput(rendered, carryForward);
}

// ============================================================================
// Structured data (JSON-LD) — Design Log #213
// ============================================================================

/**
 * Build a `<script type="application/ld+json">` HeadTag for schema.org structured data.
 *
 * Use from a `page.ts` phase: `phaseOutput(vs, cf, { headTags: [jsonLd(product)] })`.
 * The serializer emits the body breakout-safe (`serializeHeadTags`, DL#213) — do not
 * pre-escape. This is a thin helper over `JSON.stringify`; authors layer their own
 * schema.org typing if wanted (DL#213 Q2 — no schema-dts dependency).
 */
export function jsonLd(data: object): HeadTag {
    return {
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        children: JSON.stringify(data),
    };
}
