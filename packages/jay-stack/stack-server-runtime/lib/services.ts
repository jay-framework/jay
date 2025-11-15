/**
 * Service marker and registry for Jay Stack server-side dependency injection.
 * 
 * Services are global singletons (not hierarchical like client contexts) that provide
 * infrastructure capabilities like database connections, API clients, etc.
 */

// ============================================================================
// Service Marker Pattern
// ============================================================================

/**
 * A type-safe marker for identifying a service.
 * Similar to ContextMarker but for server-side services.
 */
export interface ServiceMarker<ServiceType> {}

/**
 * Creates a service marker used to register and retrieve services.
 * 
 * @example
 * ```typescript
 * export interface DatabaseService {
 *   query<T>(sql: string): Promise<T[]>;
 * }
 * 
 * export const DATABASE_SERVICE = createJayService<DatabaseService>();
 * ```
 */
export function createJayService<ServiceType = unknown>(): ServiceMarker<ServiceType> {
    return Symbol() as ServiceMarker<ServiceType>;
}

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
        throw new Error('Service not found. Did you register it in jay.init.ts?');
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

