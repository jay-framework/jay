import type { JayHtmlHeadMeta } from '@jay-framework/compiler-shared';

export interface RouteManifest {
    version: string;
    buildTimestamp: string;
    sourceHash: string;
    projectRoot: string;
    sharedManifest: Record<string, string>;
    routes: RouteEntry[];
    actions: ActionEntry[];
    plugins: PluginEntry[];
}

export interface RouteSegment {
    type: 'static' | 'param' | 'optional' | 'catchAll' | 'optionalCatchAll';
    value: string;
}

export interface RouteEntry {
    pattern: string;
    segments: RouteSegment[];
    serverModule: string;
    trackByMap?: Record<string, string>;
    contracts?: string[];
    componentExport?: string;
    /** Per-route server element path (DL#144). Shared across all instances. */
    serverElementPath?: string;
    /** Per-route CSS file path (DL#144). Extracted from route-level server element compilation. */
    routeCssPath?: string;
    /** Per-route hydrate script path (DL#144). Shared across all instances. */
    routeHydratePath?: string;
    /** Per-route client bundle path (DL#144). Entry that imports route hydrate script. */
    routeClientBundlePath?: string;
    /** External @import URLs extracted from CSS at build time (DL#146). Used for preload hints. */
    cssImports?: string[];
    /** Head metadata from jay-html <head> (title, meta tags). */
    headMeta?: JayHtmlHeadMeta;
    instances: InstanceEntry[];
    isPlugin?: boolean;
    pluginName?: string;
}

export interface InstanceEntry {
    params: Record<string, string>;
    cachePath: string;
    serverElementPath: string;
    clientBundlePath: string;
    clientCssPath?: string;
}

export interface CacheEntry {
    slowViewState: object;
    carryForward: object;
}

export interface ActionEntry {
    serverModule: string;
    packageName?: string;
    isPlugin: boolean;
    actionNames: string[];
}

export interface PluginEntry {
    name: string;
    packageName: string;
}

export interface BuildMetadata {
    version: string;
    sourceHash: string;
    buildTimestamp: string;
    nodeVersion: string;
    instanceCount: number;
}

export interface BuildOptions {
    version: string;
    projectRoot: string;
    pagesRoot: string;
    buildRoot: string;
    concurrency: number;
    tsConfigFilePath: string;
    minify?: boolean;
}

export interface ServerElementModule {
    renderToStream: (
        vs: object,
        ctx: import('@jay-framework/ssr-runtime').ServerRenderContext,
    ) => void;
}

export interface PageModule {
    [key: string]: any;
}
