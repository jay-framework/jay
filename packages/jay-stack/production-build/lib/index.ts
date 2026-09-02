// Build pipeline — used by jay-stack build. Depends on compiler + vite.
export { buildVersion } from './builder/build-pipeline';
export {
    buildInstance,
    type InstanceBuildContext,
    type InstanceBuildResult,
} from './builder/instance-pipeline';
export {
    buildInstanceClient,
    type InstanceClientBuildResult,
} from './builder/instance-client-build';
export {
    compileRouteServerElement,
    compileRouteHydrateScript,
} from './builder/server-element-compile';
export { buildSharedChunks } from './builder/shared-chunks-build';
export { buildServerCode, discoverServerEntries } from './builder/server-code-build';
export { loadProductionPageParts, buildPagePartsConfig } from './builder/load-production-parts';
export {
    crossProductParams,
    materializeRouteParams,
    dedupeByUrl,
    buildUrl,
    computeSpecificity,
} from './builder/param-routing';
export type { RouteInfo, ParamPart, MaterializedEntry } from './builder/param-routing';
export { buildRouteEntry, discoverActions, writeRouteManifest } from './builder/route-manifest';
export { generateRouteHydrationEntry } from './builder/hydration-entry-gen';
export { scanPluginRoutes } from './builder/plugin-routes';

// Re-export production-server types for convenience
export * from '@jay-framework/production-server';
