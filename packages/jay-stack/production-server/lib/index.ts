export type {
    RouteManifest,
    RouteEntry,
    RouteSegment,
    InstanceEntry,
    PreRenderedEntry,
    ActionEntry,
    PluginEntry,
    BuildMetadata,
    BuildOptions,
    ServerElementModule,
    PageModule,
} from './types';

export { buildVersion } from './builder/build-pipeline';
export { startMainServer } from './serve/main-server';
export { startRendererServer, type RendererServerOptions } from './renderer/renderer-server';
export {
    rebuild,
    rebuildContract,
    resolveContractToRoutes,
    cleanupOrphanedFiles,
    type RebuildTarget,
    type RebuildOptions,
    type RebuildResult,
} from './invalidation/index';

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
