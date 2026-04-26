import { ServiceMarker, ServiceMarkers } from './jay-stack-types';

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

    /** The handler function */
    handler: (input: Input, ...services: Services) => Promise<Output>;
}

// ============================================================================
// Builder States
// ============================================================================

type ActionBuilderState = 'Initial' | 'Services' | 'Method' | 'Caching' | 'Done';

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
> {
    /**
     * Specify services to inject into the handler.
     */
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayActionBuilder<NewServices, Input, Output, DefaultMethod>;

    /**
     * Override the HTTP method.
     */
    withMethod<M extends HttpMethod>(method: M): JayActionBuilder<Services, Input, Output, M>;

    /**
     * Enable caching (typically for GET requests).
     */
    withCaching(options?: CacheOptions): JayActionBuilder<Services, Input, Output, DefaultMethod>;

    /**
     * Define the handler function. Input and output types are inferred from the handler signature.
     */
    withHandler<I, O>(
        handler: (input: I, ...services: Services) => Promise<O>,
    ): JayAction<I, O> & JayActionDefinition<I, O, Services>;
}

// ============================================================================
// Builder Implementation
// ============================================================================

class JayActionBuilderImpl<Services extends any[], DefaultMethod extends HttpMethod>
    implements JayActionBuilder<Services, unknown, unknown, DefaultMethod>
{
    private _services: ServiceMarkers<Services> = [] as unknown as ServiceMarkers<Services>;
    private _method: HttpMethod;
    private _cacheOptions?: CacheOptions;

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

    withHandler<I, O>(
        handler: (input: I, ...services: Services) => Promise<O>,
    ): JayAction<I, O> & JayActionDefinition<I, O, Services> {
        const actionName = this._actionName;
        const method = this._method;
        const cacheOptions = this._cacheOptions;
        const serviceMarkers = this._services;

        // Create the action object with callable function and metadata
        // On server: uses global resolver to inject services automatically
        // On client: build transform replaces this with HTTP call
        const action = Object.assign(
            (input: I): Promise<O> => {
                const resolver = globalThis.__JAY_SERVICE_RESOLVER__;
                const resolvedServices = resolver ? resolver(serviceMarkers as any[]) : [];
                return handler(input, ...(resolvedServices as Services));
            },
            {
                actionName,
                method,
                cacheOptions,
                services: serviceMarkers,
                handler,
                _brand: 'JayAction' as const,
            },
        );

        return action as JayAction<I, O> & JayActionDefinition<I, O, Services>;
    }
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
    handler: (input: Input, ...services: Services) => AsyncIterable<Chunk>;
}

/**
 * Builder interface for streaming actions.
 */
export interface JayStreamBuilder<Services extends any[]> {
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayStreamBuilder<NewServices>;

    withHandler<I, C>(
        handler: (input: I, ...services: Services) => AsyncIterable<C>,
    ): JayStreamAction<I, C> & JayStreamActionDefinition<I, C, Services>;
}

class JayStreamBuilderImpl<Services extends any[]> implements JayStreamBuilder<Services> {
    private _services: ServiceMarkers<Services> = [] as unknown as ServiceMarkers<Services>;

    constructor(private readonly _actionName: string) {}

    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayStreamBuilder<NewServices> {
        this._services = services as unknown as ServiceMarkers<Services>;
        return this as unknown as JayStreamBuilder<NewServices>;
    }

    withHandler<I, C>(
        handler: (input: I, ...services: Services) => AsyncIterable<C>,
    ): JayStreamAction<I, C> & JayStreamActionDefinition<I, C, Services> {
        const actionName = this._actionName;
        const serviceMarkers = this._services;

        const action = Object.assign(
            (input: I): AsyncIterable<C> => {
                const resolver = globalThis.__JAY_SERVICE_RESOLVER__;
                const resolvedServices = resolver ? resolver(serviceMarkers as any[]) : [];
                return handler(input, ...(resolvedServices as Services));
            },
            {
                actionName,
                method: 'POST' as const,
                isStreaming: true as const,
                services: serviceMarkers,
                handler,
                _brand: 'JayStreamAction' as const,
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
