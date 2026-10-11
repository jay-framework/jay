import type { JayHtmlHeadMeta, JayHtmlScript } from '@jay-framework/stack-server-runtime';
import type { HeadTag } from '@jay-framework/fullstack-component';

export interface RouteManifest {
    version: string;
    projectRoot: string;
    sharedManifest: Record<string, string>;
    routes: RouteEntry[];
    actions: ActionEntry[];
    plugins: PluginEntry[];
    /**
     * Site-level JSON-LD (Organization + WebSite) head tags, generated once at build from
     * `.jay` `site` config and injected into every served page's `<head>` (DL#213). Empty/absent
     * when `site.name` is not configured.
     */
    siteHeadTags?: HeadTag[];
    /**
     * Compiled error pages keyed by status token (`"404"`, `"502"`, `"5xx"`, …) (DL#218).
     * Resolved by status (exact → family), never by URL — kept out of `routes[]` so they are
     * non-navigable and excluded from sitemap/llms.txt/robots/internal-link validation.
     */
    errorPages?: Record<string, ErrorPageEntry>;
}

/**
 * A compiled error page (DL#218). Mirrors the per-route compiled refs of a single-instance
 * route, minus URL/param machinery: an error page is resolved by status, not by matching a URL.
 */
export interface ErrorPageEntry {
    /** Status token this page serves — exact (`"404"`, `"502"`) or family (`"4xx"`, `"5xx"`). */
    token: string;
    /** Per-page server element path (relative to backend dir). */
    serverElementPath: string;
    /** Per-page CSS file path (relative to frontend dir). */
    routeCssPath?: string;
    /** Per-page hydrate script path (relative to frontend dir). */
    routeHydratePath?: string;
    /** Per-page client bundle path (relative to frontend dir). */
    routeClientBundlePath?: string;
    /** External @import URLs extracted from CSS at build time. */
    cssImports?: string[];
    /** Head metadata from the error page's jay-html <head>. */
    headMeta?: JayHtmlHeadMeta;
    /** Passthrough `<script jay-script="allow">` tags from the template. */
    scripts?: JayHtmlScript[];
    /** Shared chunk package names this page's hydrate/client bundle imports (DL#177). */
    sharedDeps?: string[];
    /** trackBy map threaded to the client hydration entry. */
    trackByMap?: Record<string, string>;
    /**
     * Optional pre-rendered slow (static chrome) ViewState. Unused in v1 — an error page is a
     * pass-through of the injected `error` ViewState (DL#218 Q6); its static chrome renders
     * from the template without slow data. The renderer merges `slowCache?.slowViewState ?? {}`.
     */
    slowCache?: CacheEntry;
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
    /** Passthrough `<script jay-script="allow">` tags from the jay-html template (DL#149 Phase 2). */
    scripts?: JayHtmlScript[];
    /** True when page has static <meta name="robots" content="noindex"> */
    noIndex?: boolean;
    instances: InstanceEntry[];
    isPlugin?: boolean;
    pluginName?: string;
    /** Shared chunk package names this route's hydrate script imports (DL#177). */
    sharedDeps?: string[];
    /** When true, dev-server tooling route (future: excluded from production builds). */
    devOnly?: boolean;
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
    /** Site base URL for sitemap generation (e.g. "https://example.com"). */
    siteBaseUrl?: string;
    /** Site identity for Organization + WebSite JSON-LD generation (DL#213). */
    site?: {
        name?: string;
        baseUrl?: string;
        logo?: string;
        description?: string;
        sameAs?: string[];
    };
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
