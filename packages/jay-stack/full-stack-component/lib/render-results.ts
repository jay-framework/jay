import { ClientError4xx, PhaseOutput, Redirect3xx, ServerError5xx } from './jay-stack-types';

// ============================================================================
// Error Constructors
// ============================================================================

export function serverError5xx(
    status: number,
    message?: string,
    details?: Record<string, unknown>,
): ServerError5xx {
    return {
        kind: 'ServerError',
        status,
        message,
        details,
    };
}

export function clientError4xx(
    status: number,
    message?: string,
    details?: Record<string, unknown>,
): ClientError4xx {
    return {
        kind: 'ClientError',
        status,
        message,
        details,
    };
}

export function notFound(message?: string, details?: Record<string, unknown>): ClientError4xx {
    return clientError4xx(404, message, details);
}

export function badRequest(message?: string, details?: Record<string, unknown>): ClientError4xx {
    return clientError4xx(400, message, details);
}

export function unauthorized(message?: string, details?: Record<string, unknown>): ClientError4xx {
    return clientError4xx(401, message, details);
}

export function forbidden(message?: string, details?: Record<string, unknown>): ClientError4xx {
    return clientError4xx(403, message, details);
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
 */
export function phaseOutput<ViewState extends object, CarryForward = {}>(
    rendered: ViewState,
    carryForward: CarryForward,
): PhaseOutput<ViewState, CarryForward> {
    return { kind: 'PhaseOutput', rendered, carryForward };
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
