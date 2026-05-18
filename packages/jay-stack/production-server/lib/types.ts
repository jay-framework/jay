export interface RouteManifest {
    version: number;
    buildTimestamp: string;
    sourceHash: string;
    publicBasePath: string;
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
    instances: InstanceEntry[];
    isPlugin?: boolean;
    pluginName?: string;
}

export interface InstanceEntry {
    params: Record<string, string>;
    preRenderedPath: string;
    serverElementPath: string;
    clientBundlePath: string;
    clientCssPath?: string;
}

export interface PreRenderedEntry {
    content: string;
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
    version: number;
    sourceHash: string;
    buildTimestamp: string;
    nodeVersion: string;
    instanceCount: number;
}

export interface BuildOptions {
    version: number;
    projectRoot: string;
    pagesRoot: string;
    buildRoot: string;
    publicBasePath: string;
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
