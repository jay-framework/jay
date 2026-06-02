/**
 * Serve-only exports (DL#143).
 * This entry point excludes build-time dependencies (Vite, compilers).
 * Use `@jay-framework/production-server/serve` for BaaS deployments
 * where only the serve functions are needed.
 */

export type { ArtifactStore } from './serve/artifact-store';
export { FilesystemArtifactStore } from './serve/artifact-store';
export { matchRequest, type MatchResult } from './serve/route-matcher';
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
    CacheEntry,
    ServerElementModule,
} from './types';
