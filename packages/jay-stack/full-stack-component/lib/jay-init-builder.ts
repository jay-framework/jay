/**
 * Builder for plugin/project initialization with type-safe server-to-client data flow.
 *
 * Usage:
 * ```typescript
 * export const init = makeJayInit()
 *     .withServer(async () => {
 *         registerService(MY_SERVICE, createService());
 *         return { apiUrl: config.url };
 *     })
 *     .withClient((data) => {
 *         // data is typed from withServer return!
 *         registerGlobalContext(MY_CONFIG_CONTEXT, data);
 *     });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * The compiled init object that contains server and/or client init functions.
 * The compiler transforms the builder chain into this object.
 */
export interface JayInit<T = void> {
    readonly __brand: 'JayInit';
    /** Key for namespacing (plugin name or 'project'). Filled in by framework. */
    readonly key: string;
    /** Server init function. Returns data to pass to client. */
    readonly _serverInit?: () => T | Promise<T>;
    /** Client init function. Receives data from server. */
    readonly _clientInit?: (data: T) => void | Promise<void>;
}

/**
 * Builder interface for constructing a JayInit.
 */
export interface JayInitBuilder<T = void> {
    /**
     * Defines server-side initialization logic.
     * The return value is passed to the client init function.
     *
     * @param callback - Async function that runs on server startup
     * @returns Builder with client data type set to callback's return type
     */
    withServer<R extends Record<string, any>>(
        callback: () => R | Promise<R>,
    ): JayInitBuilderWithServer<R>;

    /**
     * Defines client-side initialization logic (when no server data needed).
     *
     * @param callback - Function that runs on client before component tree mounts
     * @returns The final JayInit object
     */
    withClient(callback: () => void | Promise<void>): JayInit<void>;
}

/**
 * Builder after withServer has been called.
 */
export interface JayInitBuilderWithServer<T extends Record<string, any>> extends JayInit<T> {
    /**
     * Defines client-side initialization logic with server data.
     *
     * @param callback - Function that receives data from server init
     * @returns The final JayInit object
     */
    withClient(callback: (data: T) => void | Promise<void>): JayInit<T>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates a builder for plugin/project initialization.
 *
 * The key parameter is optional:
 * - For plugins: defaults to plugin name from plugin.yaml (injected by framework)
 * - For project: defaults to 'project'
 *
 * @param key - Optional namespace key (typically omitted)
 * @returns A builder to define server and client initialization
 *
 * @example
 * ```typescript
 * // Plugin init (key defaults to plugin name)
 * export const init = makeJayInit()
 *     .withServer(async () => {
 *         registerService(STORES_SERVICE, createService());
 *         return { currency: 'USD', enableCart: true };
 *     })
 *     .withClient((data) => {
 *         registerGlobalContext(STORES_CONFIG, data);
 *     });
 *
 * // Server-only init
 * export const init = makeJayInit()
 *     .withServer(async () => {
 *         registerService(DB_SERVICE, await connectDb());
 *     });
 *
 * // Client-only init
 * export const init = makeJayInit()
 *     .withClient(() => {
 *         initAnalytics();
 *     });
 * ```
 */
export function makeJayInit(key?: string): JayInitBuilder<void> {
    // The actual key will be injected by the framework at runtime
    // This is a placeholder that gets replaced during transformation
    const resolvedKey = key ?? '__JAY_INIT_KEY__';

    return {
        withServer<R extends Record<string, any>>(
            callback: () => R | Promise<R>,
        ): JayInitBuilderWithServer<R> {
            // Return an object that is both a JayInit (for server-only use)
            // and has withClient method (for adding client init)
            const serverOnlyInit: JayInit<R> = {
                __brand: 'JayInit',
                key: resolvedKey,
                _serverInit: callback,
            };

            return {
                // JayInit properties (allows using as server-only init)
                ...serverOnlyInit,

                // Builder method to add client init
                withClient(clientCallback: (data: R) => void | Promise<void>): JayInit<R> {
                    return {
                        __brand: 'JayInit',
                        key: resolvedKey,
                        _serverInit: callback,
                        _clientInit: clientCallback,
                    };
                },
            };
        },

        withClient(callback: () => void | Promise<void>): JayInit<void> {
            return {
                __brand: 'JayInit',
                key: resolvedKey,
                _clientInit: callback,
            };
        },
    };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an object is a JayInit.
 */
export function isJayInit(obj: unknown): obj is JayInit<any> {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        '__brand' in obj &&
        (obj as any).__brand === 'JayInit'
    );
}
