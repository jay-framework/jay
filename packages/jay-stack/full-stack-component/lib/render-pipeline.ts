import {
    ClientError4xx,
    PhaseOutput,
    Redirect3xx,
    RenderOutcome,
    ServerError5xx,
} from './jay-stack-types';
import {
    badRequest,
    clientError4xx,
    forbidden,
    notFound,
    phaseOutput,
    redirect3xx,
    serverError5xx,
    unauthorized,
} from './render-results';

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal value type - can be a resolved value, a pending promise, or an error.
 */
type PipelineValue<T> = T | Promise<T> | ServerError5xx | ClientError4xx | Redirect3xx;

/**
 * Type guard to check if a value is a RenderPipeline.
 */
function isRenderPipeline<T, VS extends object, CF extends object>(
    value: unknown,
): value is RenderPipeline<T, VS, CF> {
    return value instanceof RenderPipeline;
}

/**
 * Type guard to check if a value is an error outcome.
 */
function isErrorOutcome(value: unknown): value is ServerError5xx | ClientError4xx | Redirect3xx {
    return (
        typeof value === 'object' &&
        value !== null &&
        'kind' in value &&
        (value.kind === 'ServerError' || value.kind === 'ClientError' || value.kind === 'Redirect')
    );
}

// ============================================================================
// Pipeline Factory Type
// ============================================================================

/**
 * Factory object returned by RenderPipeline.for<VS, CF>().
 * Provides entry points to create a typed pipeline.
 */
export interface PipelineFactory<TargetVS extends object, TargetCF extends object> {
    /** Start with a success value (can be T or Promise<T>) */
    ok<T>(value: T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF>;

    /**
     * Start with a function that returns T or Promise<T>.
     * Catches errors into the pipeline (accessible via recover()).
     */
    try<T>(fn: () => T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF>;

    /** Start from an existing outcome */
    from<T extends object>(
        outcome: RenderOutcome<T, unknown>,
    ): RenderPipeline<T, TargetVS, TargetCF>;

    // Error entry points
    notFound(
        message?: string,
        details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    badRequest(
        message?: string,
        details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    unauthorized(
        message?: string,
        details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    forbidden(
        message?: string,
        details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    serverError(
        status: number,
        message?: string,
        details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    clientError(
        status: number,
        message?: string,
        details?: Record<string, unknown>,
    ): RenderPipeline<never, TargetVS, TargetCF>;
    redirect(status: number, location: string): RenderPipeline<never, TargetVS, TargetCF>;
}

// ============================================================================
// RenderPipeline Class
// ============================================================================

/**
 * A pipeline for composing render operations with automatic error propagation.
 *
 * Type Parameters:
 * - T: The current working value being transformed through the chain
 * - TargetVS: The expected ViewState output type (set via .for<>())
 * - TargetCF: The expected CarryForward output type (set via .for<>())
 *
 * Usage:
 * ```typescript
 * const Pipeline = RenderPipeline.for<SlowViewState, CarryForward>();
 *
 * return Pipeline
 *     .try(() => fetchData())
 *     .map(data => data ? data : Pipeline.notFound())
 *     .map(async data => enrichData(data))
 *     .toPhaseOutput(data => ({
 *         viewState: { ... },
 *         carryForward: { ... }
 *     }));
 * ```
 */
export class RenderPipeline<
    T,
    TargetVS extends object = object,
    TargetCF extends object = Record<string, never>,
> {
    private constructor(
        private readonly _value: PipelineValue<T | RenderPipeline<T, TargetVS, TargetCF>>,
        private readonly _isSuccess: boolean,
    ) {}

    // =========================================================================
    // Static Factory
    // =========================================================================

    /**
     * Create a typed pipeline factory with target output types declared upfront.
     * TypeScript validates that .toPhaseOutput() produces these types.
     */
    static for<
        TargetVS extends object,
        TargetCF extends object = Record<string, never>,
    >(): PipelineFactory<TargetVS, TargetCF> {
        return {
            ok<T>(value: T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF> {
                return new RenderPipeline<T, TargetVS, TargetCF>(value, true);
            },

            try<T>(fn: () => T | Promise<T>): RenderPipeline<T, TargetVS, TargetCF> {
                try {
                    const result = fn();
                    if (result instanceof Promise) {
                        // Wrap the promise to catch async errors
                        const wrappedPromise = result.catch((error: unknown) => {
                            // Convert caught error to an error marker that we can detect later
                            throw { __pipelineError: true, error };
                        });
                        return new RenderPipeline<T, TargetVS, TargetCF>(
                            wrappedPromise as Promise<T>,
                            true,
                        );
                    }
                    return new RenderPipeline<T, TargetVS, TargetCF>(result, true);
                } catch (error) {
                    // Sync error - store as caught error
                    return new RenderPipeline<T, TargetVS, TargetCF>(
                        { __caughtError: error } as unknown as T,
                        true,
                    );
                }
            },

            from<T extends object>(
                outcome: RenderOutcome<T, unknown>,
            ): RenderPipeline<T, TargetVS, TargetCF> {
                if (outcome.kind === 'PhaseOutput') {
                    return new RenderPipeline<T, TargetVS, TargetCF>(outcome.rendered as T, true);
                }
                return new RenderPipeline<T, TargetVS, TargetCF>(outcome, false);
            },

            notFound(
                message?: string,
                details?: Record<string, unknown>,
            ): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    notFound(message, details),
                    false,
                );
            },

            badRequest(
                message?: string,
                details?: Record<string, unknown>,
            ): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    badRequest(message, details),
                    false,
                );
            },

            unauthorized(
                message?: string,
                details?: Record<string, unknown>,
            ): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    unauthorized(message, details),
                    false,
                );
            },

            forbidden(
                message?: string,
                details?: Record<string, unknown>,
            ): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    forbidden(message, details),
                    false,
                );
            },

            serverError(
                status: number,
                message?: string,
                details?: Record<string, unknown>,
            ): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    serverError5xx(status, message, details),
                    false,
                );
            },

            clientError(
                status: number,
                message?: string,
                details?: Record<string, unknown>,
            ): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    clientError4xx(status, message, details),
                    false,
                );
            },

            redirect(status: number, location: string): RenderPipeline<never, TargetVS, TargetCF> {
                return new RenderPipeline<never, TargetVS, TargetCF>(
                    redirect3xx(status, location),
                    false,
                );
            },
        };
    }

    // =========================================================================
    // Transformation Methods
    // =========================================================================

    /**
     * Transform the working value. Always returns RenderPipeline (sync).
     *
     * The mapping function can return:
     * - U: Plain value
     * - Promise<U>: Async value (resolved at toPhaseOutput)
     * - RenderPipeline<U>: For conditional errors/branching
     *
     * Errors pass through unchanged.
     */
    map<U>(
        fn: (value: T) => U | Promise<U> | RenderPipeline<U, TargetVS, TargetCF>,
    ): RenderPipeline<U, TargetVS, TargetCF> {
        // Error passthrough
        if (!this._isSuccess) {
            return this as unknown as RenderPipeline<U, TargetVS, TargetCF>;
        }

        // Check if current value is a promise
        if (this._value instanceof Promise) {
            // Chain onto existing promise
            const chainedPromise = this._value.then((resolvedValue) => {
                // If resolved to a RenderPipeline, unwrap and continue
                if (isRenderPipeline<T, TargetVS, TargetCF>(resolvedValue)) {
                    return resolvedValue.map(fn)._value;
                }
                // If resolved to an error, pass through
                if (isErrorOutcome(resolvedValue)) {
                    return resolvedValue;
                }
                // Apply the mapping function
                return fn(resolvedValue as T);
            });
            return new RenderPipeline<U, TargetVS, TargetCF>(
                chainedPromise as Promise<U | RenderPipeline<U, TargetVS, TargetCF>>,
                true,
            );
        }

        // Check if current value is an error (shouldn't happen if _isSuccess is true, but be safe)
        if (isErrorOutcome(this._value)) {
            return new RenderPipeline<U, TargetVS, TargetCF>(this._value, false);
        }

        // Check if current value is a RenderPipeline
        if (isRenderPipeline<T, TargetVS, TargetCF>(this._value)) {
            return this._value.map(fn);
        }

        // Apply the mapping function to the immediate value
        const result = fn(this._value as T);

        // Handle the different return types
        if (isRenderPipeline<U, TargetVS, TargetCF>(result)) {
            return result;
        }

        return new RenderPipeline<U, TargetVS, TargetCF>(result, true);
    }

    /**
     * Handle errors, potentially recovering to a success.
     * The function receives the caught Error and can return a new pipeline.
     */
    recover<U>(
        fn: (error: Error) => RenderPipeline<U, TargetVS, TargetCF>,
    ): RenderPipeline<T | U, TargetVS, TargetCF> {
        // If already an error outcome, apply recovery
        if (!this._isSuccess && isErrorOutcome(this._value)) {
            // Convert error outcome to Error object for the recovery function
            const error = new Error(
                (this._value as ServerError5xx | ClientError4xx).message ||
                    `${this._value.kind}: ${(this._value as ServerError5xx | ClientError4xx).status}`,
            );
            (error as any).outcome = this._value;
            return fn(error) as RenderPipeline<T | U, TargetVS, TargetCF>;
        }

        // If value is a promise, we need to handle async errors
        if (this._value instanceof Promise) {
            const recoveredPromise = this._value
                .then((resolved) => {
                    if (isRenderPipeline<T, TargetVS, TargetCF>(resolved)) {
                        return resolved.recover(fn)._value;
                    }
                    if (isErrorOutcome(resolved)) {
                        const error = new Error(
                            (resolved as ServerError5xx | ClientError4xx).message ||
                                `${resolved.kind}: ${(resolved as ServerError5xx | ClientError4xx).status}`,
                        );
                        (error as any).outcome = resolved;
                        return fn(error)._value;
                    }
                    return resolved;
                })
                .catch((caught: unknown) => {
                    // Handle caught exceptions from async operations
                    // Check for wrapped pipeline error
                    let actualError: unknown = caught;
                    if (
                        typeof caught === 'object' &&
                        caught !== null &&
                        '__pipelineError' in caught
                    ) {
                        actualError = (caught as { __pipelineError: boolean; error: unknown })
                            .error;
                    }
                    const error =
                        actualError instanceof Error ? actualError : new Error(String(actualError));
                    return fn(error)._value;
                });
            return new RenderPipeline<T | U, TargetVS, TargetCF>(
                recoveredPromise as Promise<T | U>,
                true,
            );
        }

        // Check for caught sync errors
        if (
            typeof this._value === 'object' &&
            this._value !== null &&
            '__caughtError' in (this._value as object)
        ) {
            const caught = (this._value as unknown as { __caughtError: unknown }).__caughtError;
            const error = caught instanceof Error ? caught : new Error(String(caught));
            return fn(error) as RenderPipeline<T | U, TargetVS, TargetCF>;
        }

        // No error to recover from
        return this as unknown as RenderPipeline<T | U, TargetVS, TargetCF>;
    }

    // =========================================================================
    // Terminal Methods
    // =========================================================================

    /**
     * Convert to final PhaseOutput. This is the ONLY async method.
     * Resolves all pending promises and applies the final mapping.
     */
    async toPhaseOutput(
        fn: (value: T) => { viewState: TargetVS; carryForward: TargetCF },
    ): Promise<RenderOutcome<TargetVS, TargetCF>> {
        // Resolve the value
        let resolvedValue:
            | T
            | RenderPipeline<T, TargetVS, TargetCF>
            | ServerError5xx
            | ClientError4xx
            | Redirect3xx;

        if (this._value instanceof Promise) {
            try {
                resolvedValue = await this._value;
            } catch (caught: unknown) {
                // Unhandled async error - convert to server error
                // Check for wrapped pipeline error
                let actualError: unknown = caught;
                if (typeof caught === 'object' && caught !== null && '__pipelineError' in caught) {
                    actualError = (caught as { __pipelineError: boolean; error: unknown }).error;
                }
                const message =
                    actualError instanceof Error
                        ? (actualError as Error).message
                        : String(actualError);
                return serverError5xx(500, message);
            }
        } else {
            resolvedValue = this._value;
        }

        // Check for caught sync errors that weren't recovered
        if (
            typeof resolvedValue === 'object' &&
            resolvedValue !== null &&
            '__caughtError' in (resolvedValue as object)
        ) {
            const caught = (resolvedValue as unknown as { __caughtError: unknown }).__caughtError;
            const message = caught instanceof Error ? (caught as Error).message : String(caught);
            return serverError5xx(500, message);
        }

        // If resolved to a RenderPipeline, recurse
        if (isRenderPipeline<T, TargetVS, TargetCF>(resolvedValue)) {
            return resolvedValue.toPhaseOutput(fn);
        }

        // If it's an error, return it
        if (isErrorOutcome(resolvedValue)) {
            return resolvedValue;
        }

        // Apply the final mapping
        const { viewState, carryForward } = fn(resolvedValue as T);
        return phaseOutput(viewState, carryForward);
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    /** Check if this pipeline is in a success state */
    isOk(): boolean {
        return this._isSuccess;
    }

    /** Check if this pipeline is in an error state */
    isError(): boolean {
        return !this._isSuccess;
    }
}
