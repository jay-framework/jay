import type { ActionRequest, ServiceMarkers, StreamActionRequest } from './jay-stack-types';

// ============================================================================
// Global Service Resolver
// ============================================================================

/**
 * Service resolver function type.
 * Registered by stack-server-runtime to enable automatic service injection
 * when actions are called from server-side code.
 */
type ServiceResolver = (markers: any[]) => any[];

declare global {
    // eslint-disable-next-line no-var
    var __JAY_SERVICE_RESOLVER__: ServiceResolver | undefined;
}

// ============================================================================
// File Upload Types (DL#131)
// ============================================================================

/**
 * Represents a file in a Jay action.
 *
 * On the **client**, browser `File` and `Blob` objects are assignable to this type
 * (they have `name`, `type`, `size`). The framework converts them to FormData automatically.
 *
 * On the **server**, the framework populates `path` with a temp file location.
 * The temp file is cleaned up after the handler returns.
 */
export interface JayFile {
    /** Original filename */
    name: string;
    /** MIME type */
    type: string;
    /** File size in bytes */
    size: number;
    /** Absolute path to the temp file on disk (server-side only, always present in handlers) */
    path?: string;
}

// ============================================================================
// HTTP Method and Cache Types
// ============================================================================

/**
 * Supported HTTP methods for actions and queries.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Cache options for GET requests.
 */
export interface CacheOptions {
    /** Cache duration in seconds */
    maxAge?: number;
    /** Time in seconds to serve stale content while revalidating */
    staleWhileRevalidate?: number;
}

// ============================================================================
// ActionError
// ============================================================================

/**
 * Error class for action/query failures.
 * Thrown from action handlers to indicate business logic errors.
 *
 * @example
 * ```typescript
 * throw new ActionError('NOT_AVAILABLE', 'Only 2 units available');
 * ```
 */
export class ActionError extends Error {
    public readonly name = 'ActionError';

    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

// ============================================================================
// JayAction Type
// ============================================================================

/**
 * A callable action/query that makes an HTTP request to the server.
 * This is the final type returned by the builder's withHandler() method.
 */
export interface JayAction<Input, Output> {
    /** Call the action - makes HTTP request to server */
    (input: Input): Promise<Output>;

    /** Unique action name for routing */
    readonly actionName: string;

    /** HTTP method (GET, POST, etc.) */
    readonly method: HttpMethod;

    /** Internal marker for type identification */
    readonly _brand: 'JayAction';
}

// ============================================================================
// Action Definition (for server-side registration)
// ============================================================================

/**
 * Internal action definition used for server-side registration.
 * Contains all metadata and the handler function.
 */
export interface JayActionDefinition<Input, Output, Services extends any[]> {
    /** Unique action name */
    actionName: string;

    /** HTTP method */
    method: HttpMethod;

    /** Cache options (for GET requests) */
    cacheOptions?: CacheOptions;

    /** Service markers for dependency injection */
    services: ServiceMarkers<Services>;

    /** Whether this action accepts file uploads (DL#131) */
    acceptsFiles?: boolean;

    /** Whether the handler receives the request as its second argument (DL#229) */
    needsRequest?: boolean;

    /** The handler function. With `needsRequest`, it is called as (input, request, ...services). */
    handler: (input: Input, ...args: any[]) => Promise<Output>;
}

// ============================================================================
// Builder States
// ============================================================================

/** The handler signature, with the request inserted at position 2 when opted in (DL#229). */
export type ActionHandler<
    I,
    O,
    Services extends any[],
    WithRequest extends boolean,
> = WithRequest extends true
    ? (input: I, request: ActionRequest, ...services: Services) => Promise<O>
    : (input: I, ...services: Services) => Promise<O>;

/** The stream handler signature, with a read-only request at position 2 when opted in (DL#229). */
export type StreamActionHandler<
    I,
    C,
    Services extends any[],
    WithRequest extends boolean,
> = WithRequest extends true
    ? (input: I, request: StreamActionRequest, ...services: Services) => AsyncIterable<C>
    : (input: I, ...services: Services) => AsyncIterable<C>;

// ============================================================================
// Builder Interface
// ============================================================================

/**
 * Builder interface for creating type-safe actions/queries.
 */
export interface JayActionBuilder<
    Services extends any[],
    Input,
    Output,
    DefaultMethod extends HttpMethod,
    WithRequest extends boolean = false,
> {
    /**
     * Specify services to inject into the handler.
     */
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayActionBuilder<NewServices, Input, Output, DefaultMethod, WithRequest>;

    /**
     * Override the HTTP method.
     */
    withMethod<M extends HttpMethod>(
        method: M,
    ): JayActionBuilder<Services, Input, Output, M, WithRequest>;

    /**
     * Enable caching (typically for GET requests).
     * Not allowed together with withRequest() (DL#229).
     */
    withCaching(
        options?: CacheOptions,
    ): JayActionBuilder<Services, Input, Output, DefaultMethod, WithRequest>;

    /**
     * Mark this action as accepting file uploads (DL#131).
     * The handler will receive JayFile objects for file fields.
     */
    withFiles(): JayActionBuilder<Services, Input, Output, DefaultMethod, WithRequest>;

    /**
     * Receive the caller's cookies, and set response cookies, through an `ActionRequest`
     * passed as the handler's second argument: `(input, request, ...services)` (DL#229).
     */
    withRequest(): JayActionBuilder<Services, Input, Output, DefaultMethod, true>;

    /**
     * Define the handler function. Input and output types are inferred from the handler signature.
     */
    withHandler<I, O>(
        handler: ActionHandler<I, O, Services, WithRequest>,
    ): JayAction<I, O> & JayActionDefinition<I, O, Services>;
}

// ============================================================================
// Builder Implementation
// ============================================================================

class JayActionBuilderImpl<
    Services extends any[],
    DefaultMethod extends HttpMethod,
> implements JayActionBuilder<Services, unknown, unknown, DefaultMethod> {
    private _services: ServiceMarkers<Services> = [] as unknown as ServiceMarkers<Services>;
    private _method: HttpMethod;
    private _cacheOptions?: CacheOptions;
    private _acceptsFiles = false;
    private _needsRequest = false;

    constructor(
        private readonly _actionName: string,
        defaultMethod: DefaultMethod,
    ) {
        this._method = defaultMethod;
    }

    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayActionBuilder<NewServices, unknown, unknown, DefaultMethod> {
        this._services = services as unknown as ServiceMarkers<Services>;
        return this as unknown as JayActionBuilder<NewServices, unknown, unknown, DefaultMethod>;
    }

    withMethod<M extends HttpMethod>(method: M): JayActionBuilder<Services, unknown, unknown, M> {
        this._method = method;
        return this as unknown as JayActionBuilder<Services, unknown, unknown, M>;
    }

    withCaching(
        options?: CacheOptions,
    ): JayActionBuilder<Services, unknown, unknown, DefaultMethod> {
        this._cacheOptions = options ?? { maxAge: 60 };
        return this;
    }

    withFiles(): JayActionBuilder<Services, unknown, unknown, DefaultMethod> {
        this._acceptsFiles = true;
        return this;
    }

    withRequest(): JayActionBuilder<Services, unknown, unknown, DefaultMethod, true> {
        this._needsRequest = true;
        return this as unknown as JayActionBuilder<Services, unknown, unknown, DefaultMethod, true>;
    }

    withHandler<I, O>(
        handler: ActionHandler<I, O, Services, any>,
    ): JayAction<I, O> & JayActionDefinition<I, O, Services> {
        const actionName = this._actionName;
        const method = this._method;
        const cacheOptions = this._cacheOptions;
        const serviceMarkers = this._services;
        const acceptsFiles = this._acceptsFiles;
        const needsRequest = this._needsRequest;
        if (needsRequest && cacheOptions) {
            throw new Error(
                `Action '${actionName}' uses .withRequest() and .withCaching(): a handler that reads cookies is per-user and must not be cached. Remove .withCaching().`,
            );
        }
        const anyHandler = handler as (input: I, ...args: any[]) => Promise<O>;

        // Create the action object with callable function and metadata
        // On server: uses global resolver to inject services automatically
        // On client: build transform replaces this with HTTP call
        const action = Object.assign(
            (input: I): Promise<O> => {
                const services = resolveServicesForDirectCall(serviceMarkers);
                return needsRequest
                    ? anyHandler(input, createDetachedActionRequest(actionName), ...services)
                    : anyHandler(input, ...services);
            },
            {
                actionName,
                method,
                cacheOptions,
                services: serviceMarkers,
                handler: anyHandler,
                _brand: 'JayAction' as const,
                ...(acceptsFiles && { acceptsFiles: true }),
                ...(needsRequest && { needsRequest: true }),
            },
        );

        return action as JayAction<I, O> & JayActionDefinition<I, O, Services>;
    }
}

function resolveServicesForDirectCall(serviceMarkers: ServiceMarkers<any[]>): any[] {
    const resolver = globalThis.__JAY_SERVICE_RESOLVER__;
    return resolver ? resolver(serviceMarkers as any[]) : [];
}

const EMPTY_COOKIES: Readonly<Record<string, string>> = Object.freeze({});

/**
 * The request a handler receives when called directly, outside an HTTP request (DL#229 Q4):
 * no cookies, and cookie writes are dropped because there is no response to carry them.
 */
function createDetachedActionRequest(actionName: string): ActionRequest {
    const warnDropped = (name: string) =>
        console.warn(
            `[Jay] Action '${actionName}' set cookie '${name}' outside an HTTP request; the cookie is discarded.`,
        );
    return Object.freeze({
        cookies: EMPTY_COOKIES,
        setCookie: (name: string) => warnDropped(name),
        clearCookie: (name: string) => warnDropped(name),
    });
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an action (defaults to POST method).
 * Use for mutations: add to cart, submit form, update profile, etc.
 *
 * @param name - Unique action name (e.g., 'cart.addToCart')
 *
 * @example
 * ```typescript
 * export const addToCart = makeJayAction('cart.addToCart')
 *     .withServices(CART_SERVICE)
 *     .withHandler(async (input: { productId: string; quantity: number }, cartService) => {
 *         const cart = await cartService.addItem(input.productId, input.quantity);
 *         return { cartItemCount: cart.items.length };
 *     });
 * ```
 */
export function makeJayAction(name: string): JayActionBuilder<[], unknown, unknown, 'POST'> {
    return new JayActionBuilderImpl<[], 'POST'>(name, 'POST');
}

/**
 * Create a query (defaults to GET method).
 * Use for reads: search, get details, list items, etc.
 * GET enables browser/CDN caching.
 *
 * @param name - Unique query name (e.g., 'products.search')
 *
 * @example
 * ```typescript
 * export const searchProducts = makeJayQuery('products.search')
 *     .withServices(PRODUCTS_DATABASE_SERVICE)
 *     .withCaching({ maxAge: 60 })
 *     .withHandler(async (input: { query: string }, productsDb) => {
 *         return productsDb.search(input.query);
 *     });
 * ```
 */
export function makeJayQuery(name: string): JayActionBuilder<[], unknown, unknown, 'GET'> {
    return new JayActionBuilderImpl<[], 'GET'>(name, 'GET');
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Extract the input type from a JayAction.
 */
export type ActionInput<T> = T extends JayAction<infer I, any> ? I : never;

/**
 * Extract the output type from a JayAction.
 */
export type ActionOutput<T> = T extends JayAction<any, infer O> ? O : never;

/**
 * Check if a value is a JayAction.
 */
export function isJayAction(value: unknown): value is JayAction<unknown, unknown> {
    return (
        typeof value === 'function' &&
        (value as any)._brand === 'JayAction' &&
        typeof (value as any).actionName === 'string'
    );
}

// ============================================================================
// Streaming Actions (DL#129)
// ============================================================================

/**
 * A callable streaming action that returns an async iterable of chunks.
 * Server handler is an async generator; client receives chunks via NDJSON.
 */
export interface JayStreamAction<Input, Chunk> {
    /** Call the action — returns async iterable of chunks */
    (input: Input): AsyncIterable<Chunk>;

    /** Unique action name for routing */
    readonly actionName: string;

    /** HTTP method (always POST for streaming) */
    readonly method: 'POST';

    /** Streaming flag */
    readonly isStreaming: true;

    /** Internal marker for type identification */
    readonly _brand: 'JayStreamAction';
}

/**
 * Internal definition for server-side registration of streaming actions.
 */
export interface JayStreamActionDefinition<Input, Chunk, Services extends any[]> {
    actionName: string;
    method: 'POST';
    isStreaming: true;
    services: ServiceMarkers<Services>;
    /** Whether this action accepts file uploads (DL#131) */
    acceptsFiles?: boolean;
    /** Whether the handler receives the read-only request as its second argument (DL#229) */
    needsRequest?: boolean;
    /** With `needsRequest`, it is called as (input, request, ...services). */
    handler: (input: Input, ...args: any[]) => AsyncIterable<Chunk>;
}

/**
 * Builder interface for streaming actions.
 */
export interface JayStreamBuilder<Services extends any[], WithRequest extends boolean = false> {
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayStreamBuilder<NewServices, WithRequest>;

    /**
     * Mark this streaming action as accepting file uploads (DL#131).
     */
    withFiles(): JayStreamBuilder<Services, WithRequest>;

    /**
     * Receive the caller's cookies (read-only) as the handler's second argument (DL#229).
     * Streams cannot set cookies: headers are sent before the generator runs.
     */
    withRequest(): JayStreamBuilder<Services, true>;

    withHandler<I, C>(
        handler: StreamActionHandler<I, C, Services, WithRequest>,
    ): JayStreamAction<I, C> & JayStreamActionDefinition<I, C, Services>;
}

class JayStreamBuilderImpl<Services extends any[]> implements JayStreamBuilder<Services> {
    private _services: ServiceMarkers<Services> = [] as unknown as ServiceMarkers<Services>;
    private _acceptsFiles = false;
    private _needsRequest = false;

    constructor(private readonly _actionName: string) {}

    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayStreamBuilder<NewServices> {
        this._services = services as unknown as ServiceMarkers<Services>;
        return this as unknown as JayStreamBuilder<NewServices>;
    }

    withFiles(): JayStreamBuilder<Services> {
        this._acceptsFiles = true;
        return this;
    }

    withRequest(): JayStreamBuilder<Services, true> {
        this._needsRequest = true;
        return this as unknown as JayStreamBuilder<Services, true>;
    }

    withHandler<I, C>(
        handler: StreamActionHandler<I, C, Services, any>,
    ): JayStreamAction<I, C> & JayStreamActionDefinition<I, C, Services> {
        const actionName = this._actionName;
        const serviceMarkers = this._services;
        const acceptsFiles = this._acceptsFiles;
        const needsRequest = this._needsRequest;
        const anyHandler = handler as (input: I, ...args: any[]) => AsyncIterable<C>;

        const action = Object.assign(
            (input: I): AsyncIterable<C> => {
                const services = resolveServicesForDirectCall(serviceMarkers);
                return needsRequest
                    ? anyHandler(input, createDetachedActionRequest(actionName), ...services)
                    : anyHandler(input, ...services);
            },
            {
                actionName,
                method: 'POST' as const,
                isStreaming: true as const,
                services: serviceMarkers,
                handler: anyHandler,
                _brand: 'JayStreamAction' as const,
                ...(acceptsFiles && { acceptsFiles: true }),
                ...(needsRequest && { needsRequest: true }),
            },
        );

        return action as JayStreamAction<I, C> & JayStreamActionDefinition<I, C, Services>;
    }
}

/**
 * Create a streaming action that yields chunks via an async generator.
 * Use for paginated data, long-running operations, or any streaming response.
 *
 * @param name - Unique action name (e.g., 'routes.discoverParams')
 *
 * @example
 * ```typescript
 * export const discoverParams = makeJayStream('routes.discoverParams')
 *     .withServices(PRODUCTS_SERVICE)
 *     .withHandler(async function* (input: { route: string }, productsService) {
 *         let page = 1;
 *         while (true) {
 *             const products = await productsService.list({ page, pageSize: 100 });
 *             yield products.map(p => ({ slug: p.slug }));
 *             if (!products.hasMore) break;
 *             page++;
 *         }
 *     });
 * ```
 */
export function makeJayStream(name: string): JayStreamBuilder<[]> {
    return new JayStreamBuilderImpl<[]>(name);
}

/**
 * Check if a value is a JayStreamAction.
 */
export function isJayStreamAction(value: unknown): value is JayStreamAction<unknown, unknown> {
    return (
        typeof value === 'function' &&
        (value as any)._brand === 'JayStreamAction' &&
        typeof (value as any).actionName === 'string'
    );
}

/**
 * Extract the chunk type from a JayStreamAction.
 */
export type StreamChunk<T> = T extends JayStreamAction<any, infer C> ? C : never;
