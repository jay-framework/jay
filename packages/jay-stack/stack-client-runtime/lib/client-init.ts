/**
 * Client-side initialization for Jay Stack.
 *
 * Provides hooks for initializing client-side contexts and services
 * before the component tree is mounted.
 *
 * Data flow:
 * 1. Server: setClientInitData(key, data) collects namespaced config
 * 2. Server: Embeds all namespaced data as JSON in page HTML
 * 3. Client: Plugins/project register callbacks via onClientInit(key, callback)
 * 4. Client: runClientInit() executes callbacks with their namespaced data
 * 5. Client: Component tree is mounted with contexts available
 */

// Re-export registerGlobalContext for convenience
// Users can import { onClientInit, registerGlobalContext } from '@jay-framework/stack-client-runtime'
export { registerGlobalContext } from '@jay-framework/runtime';

type ClientInitCallback = (serverData: Record<string, any>) => void | Promise<void>;

interface NamespacedCallback {
    key: string;
    callback: ClientInitCallback;
}

const clientInitCallbacks: NamespacedCallback[] = [];

/**
 * Registers a callback to be executed during client initialization.
 * The callback receives only the data that was set with the matching key
 * on the server via setClientInitData(key, data).
 *
 * @param key - Namespace key (should match the key used in setClientInitData)
 * @param callback - Function to initialize client contexts/services
 *
 * @example
 * ```typescript
 * // src/jay.client-init.ts
 * import { onClientInit, registerGlobalContext } from '@jay-framework/stack-client-runtime';
 * import { APP_CONFIG_CONTEXT } from './contexts/app-config';
 *
 * onClientInit('project', (serverData) => {
 *   registerGlobalContext(APP_CONFIG_CONTEXT, {
 *     itemsPerPage: serverData.itemsPerPage,
 *     featureFlags: serverData.featureFlags,
 *   });
 * });
 * ```
 *
 * @example
 * ```typescript
 * // In plugin client init
 * export function clientInit() {
 *   onClientInit('wix-stores', (serverData) => {
 *     registerGlobalContext(STORES_CONTEXT, {
 *       currency: serverData.currency,
 *     });
 *   });
 * }
 * ```
 */
export function onClientInit(key: string, callback: ClientInitCallback): void {
    clientInitCallbacks.push({ key, callback });
}

/**
 * Executes all registered client init callbacks with their namespaced data.
 * Internal API called by generated page script before mounting components.
 *
 * @param allServerData - Object with namespace keys and their data
 */
export async function runClientInit(allServerData: Record<string, Record<string, any>>): Promise<void> {
    for (const { key, callback } of clientInitCallbacks) {
        const data = allServerData[key] || {};
        await callback(data);
    }
}

/**
 * Clears all registered client init callbacks.
 * Internal API for testing.
 */
export function clearClientInitCallbacks(): void {
    clientInitCallbacks.length = 0;
}

