/**
 * Serve-only exports (DL#143).
 * This entry point excludes build-time dependencies (Vite, compilers).
 * Use `@jay-framework/production-server/serve` for BaaS deployments
 * where only the serve functions are needed.
 */

export type { ArtifactStore, ListInstancesOptions } from './serve/artifact-store';
export {
    FilesystemArtifactStore,
    CacheNotFoundError,
    serializeCacheEntry,
    parseCacheEntry,
} from './serve/artifact-store';
export { matchRoutes, type MatchResult, type RouteMatch } from './serve/route-matcher';
export { resolveRequest, type ResolveResult } from './serve/resolve-request';
export {
    InstanceRenderer,
    type InstanceRendererOptions,
    type RefreshStart,
    type MissOutcome,
} from './serve/instance-renderer';
export { SwrCache, DEFAULT_LIST_TTL_MS } from './serve/swr-cache';
export {
    canonicalParams,
    instanceKey,
    deriveCachePath,
    routeInstanceDir,
    synthesizeInstance,
    toInstanceRef,
} from './shared/instance-key';
export { fetchPageRequest } from './serve/fetch-page-handler';
export {
    fetchActionRequest,
    isActionRequest,
    registerActionsFromManifest,
    registerActionsFromModules,
} from './serve/fetch-action-handler';
export { fetchStaticFile } from './serve/fetch-static-handler';
export {
    initializeServices,
    initializeServicesFromModules,
    type PreImportedPlugin,
} from './shared/init-services';

export type {
    RouteManifest,
    RouteEntry,
    InstanceEntry,
    InstanceRef,
    CacheEntry,
    ServerElementModule,
} from './types';
