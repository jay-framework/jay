// Production server — serve + rebuild. Zero compiler deps.
// Build pipeline has moved to @jay-framework/production-build.

export type {
    RouteManifest,
    RouteEntry,
    RouteSegment,
    InstanceEntry,
    CacheEntry,
    ActionEntry,
    PluginEntry,
    BuildMetadata,
    BuildOptions,
    ServerElementModule,
    PageModule,
} from './types';

export { generateSitemap, buildUrlFromManifest } from './builder/generate-sitemap';
export { generateSiteJsonLd, type SiteJsonLdConfig } from './builder/generate-site-json-ld';
export { generateLlmsTxt, type LlmsTxtSiteConfig } from './builder/generate-llms-txt';
export { generateRobotsTxtIfAbsent } from './builder/generate-robots-txt';

export { startMainServer, type MainServerOptions } from './serve/main-server';
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

export { loadPagePartsFromConfig } from './builder/load-production-parts';
