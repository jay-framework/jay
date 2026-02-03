/**
 * Service registry for Jay Stack server-side dependency injection.
 *
 * Services are global singletons (not hierarchical like client contexts) that provide
 * infrastructure capabilities like database connections, API clients, etc.
 *
 * Note: ServiceMarker and createJayService are defined in @jay-framework/fullstack-component
 * to avoid circular dependencies. This module contains only the runtime implementation.
 */

import type { ServiceMarker } from '@jay-framework/fullstack-component';

// ============================================================================
// Service Registry
// ============================================================================

const serviceRegistry = new Map<symbol, any>();

/**
 * Registers a service instance with the given marker.
 * Typically called within an `onInit()` callback.
 *
 * @param marker - The service marker created with `createJayService()`
 * @param service - The service instance to register
 *
 * @example
 * ```typescript
 * onInit(async () => {
 *   const db = await createDatabase();
 *   registerService(DATABASE_SERVICE, db);
 * });
 * ```
 */
export function registerService<ServiceType>(
    marker: ServiceMarker<ServiceType>,
    service: ServiceType,
): void {
    serviceRegistry.set(marker as symbol, service);
}

/**
 * Retrieves a registered service by its marker.
 * Throws an error if the service is not found.
 *
 * @param marker - The service marker
 * @returns The registered service instance
 * @throws Error if service is not registered
 *
 * @example
 * ```typescript
 * onShutdown(async () => {
 *   const db = getService(DATABASE_SERVICE);
 *   await db?.close();
 * });
 * ```
 */
export function getService<ServiceType>(marker: ServiceMarker<ServiceType>): ServiceType {
    const service = serviceRegistry.get(marker as symbol);
    if (service === undefined) {
        const symbolKey = marker as symbol;
        const serviceName = symbolKey.description || 'Unknown service';
        throw new Error(
            `Service '${serviceName}' not found. Did you register it in jay.init.ts?\n` +
                `Make sure to call: registerService(${serviceName.toUpperCase()}_SERVICE, ...)`,
        );
    }
    return service;
}

/**
 * Checks if a service is registered.
 *
 * @param marker - The service marker
 * @returns true if the service is registered
 */
export function hasService<ServiceType>(marker: ServiceMarker<ServiceType>): boolean {
    return serviceRegistry.has(marker as symbol);
}

/**
 * Clears all registered services.
 * Internal API used by dev-server during hot reload.
 */
export function clearServiceRegistry(): void {
    serviceRegistry.clear();
}

/**
 * Returns the internal service registry map.
 * Internal API used by contract materializer to pass services to dynamic generators.
 */
export function getServiceRegistry(): Map<symbol, any> {
    return serviceRegistry;
}

/**
 * Resolves an array of service markers to their registered instances.
 * Used by the runtime to inject services into render functions.
 *
 * @param serviceMarkers - Array of service markers to resolve
 * @returns Array of resolved service instances
 *
 * @example
 * ```typescript
 * const services = resolveServices([DATABASE_SERVICE, INVENTORY_SERVICE]);
 * // Returns: [databaseInstance, inventoryInstance]
 * ```
 */
export function resolveServices(serviceMarkers: any[]): Array<any> {
    return serviceMarkers.map((marker) => getService(marker));
}

// ============================================================================
// Global Service Resolver Registration
// ============================================================================

/**
 * Register the service resolver globally so that actions called from
 * server-side code (e.g., render phases) can automatically resolve services.
 * 
 * This enables direct action calls like `await queryItems({...})` to work
 * on the server without needing a separate runAction wrapper.
 */
globalThis.__JAY_SERVICE_RESOLVER__ = resolveServices;

// ============================================================================
// Lifecycle Hooks
// ============================================================================

type InitCallback = () => void | Promise<void>;
type ShutdownCallback = () => void | Promise<void>;

const initCallbacks: InitCallback[] = [];
const shutdownCallbacks: ShutdownCallback[] = [];

/**
 * Registers a callback to be executed during service initialization.
 * Multiple callbacks can be registered and will be executed in order.
 *
 * @param callback - Async or sync function to initialize services
 *
 * @example
 * ```typescript
 * onInit(async () => {
 *   const db = await connectToDatabase(process.env.DATABASE_URL);
 *   registerService(DATABASE_SERVICE, db);
 * });
 * ```
 */
export function onInit(callback: InitCallback): void {
    initCallbacks.push(callback);
}

/**
 * Registers a callback to be executed during service shutdown.
 * Multiple callbacks can be registered. They execute in reverse order (LIFO).
 *
 * @param callback - Async or sync function to clean up services
 *
 * @example
 * ```typescript
 * onShutdown(async () => {
 *   const db = getService(DATABASE_SERVICE);
 *   await db?.close();
 * });
 * ```
 */
export function onShutdown(callback: ShutdownCallback): void {
    shutdownCallbacks.push(callback);
}

/**
 * Executes all registered init callbacks in order.
 * Internal API called by dev-server on startup.
 */
export async function runInitCallbacks(): Promise<void> {
    for (const callback of initCallbacks) {
        await callback();
    }
}

/**
 * Executes all registered shutdown callbacks in reverse order (LIFO).
 * Internal API called by dev-server on shutdown/reload.
 */
export async function runShutdownCallbacks(): Promise<void> {
    // Run in reverse order (last registered, first shut down)
    for (let i = shutdownCallbacks.length - 1; i >= 0; i--) {
        await shutdownCallbacks[i]();
    }
}

/**
 * Clears all registered lifecycle callbacks.
 * Internal API used by dev-server during hot reload.
 */
export function clearLifecycleCallbacks(): void {
    initCallbacks.length = 0;
    shutdownCallbacks.length = 0;
}

// ============================================================================
// Client Init Data
// ============================================================================

/**
 * Client init data is static configuration passed from server to client.
 * It's set once at server startup (not per-request) and embedded in all page HTML.
 *
 * Data is namespaced by key (typically plugin name or 'project') so each
 * client init callback receives only its own data.
 *
 * Use cases:
 * - OAuth client IDs
 * - Feature flags
 * - A/B test configuration
 * - Items per page defaults
 *
 * Note: This data should be slowly-changing and NOT per-request/per-user.
 * For dynamic data, use page props and component rendering.
 */
let clientInitData: Record<string, Record<string, any>> = {};

/**
 * Sets client init data for a specific namespace (plugin or project).
 * Each namespace's data is kept separate and passed only to the matching
 * client init callback.
 *
 * @param key - Namespace key (plugin name or 'project')
 * @param data - Data object for this namespace
 *
 * @example
 * ```typescript
 * // In plugin server init
 * onInit(async () => {
 *   setClientInitData('wix-stores', {
 *     currency: 'USD',
 *     apiEndpoint: process.env.STORES_API_URL,
 *   });
 * });
 *
 * // In project jay.init.ts
 * onInit(async () => {
 *   setClientInitData('project', {
 *     oauthClientId: process.env.OAUTH_CLIENT_ID,
 *     featureFlags: await loadFeatureFlags(),
 *   });
 * });
 * ```
 */
export function setClientInitData(key: string, data: Record<string, any>): void {
    clientInitData[key] = { ...(clientInitData[key] || {}), ...data };
}

/**
 * Gets all namespaced client init data.
 * Internal API used by page rendering to embed data in HTML.
 *
 * @returns Object with namespace keys and their data
 */
export function getClientInitData(): Record<string, Record<string, any>> {
    return clientInitData;
}

/**
 * Gets client init data for a specific namespace.
 *
 * @param key - Namespace key
 * @returns Data for that namespace, or empty object if not set
 */
export function getClientInitDataForKey(key: string): Record<string, any> {
    return clientInitData[key] || {};
}

/**
 * Clears client init data.
 * Internal API used by dev-server during hot reload.
 */
export function clearClientInitData(): void {
    clientInitData = {};
}
