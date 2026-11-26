import {
    type ArtifactStore,
    type PreImportedPlugin,
    FilesystemArtifactStore,
    InstanceRenderer,
    resolveRequest,
    fetchPageRequest,
    fetchActionRequest,
    isActionRequest,
    fetchStaticFile,
    registerActionsFromManifest,
    registerActionsFromModules,
    initializeServices,
    initializeServicesFromModules,
} from '@jay-framework/production-server';
import { parseCookies } from '@jay-framework/stack-server-runtime';
import { getLogger } from '@jay-framework/logger';

export type { ArtifactStore } from '@jay-framework/production-server';
export type { PreImportedPlugin } from '@jay-framework/production-server';

export interface JayFetchHandlerOptions {
    /** Filesystem path to backend build output (creates FilesystemArtifactStore) */
    backendDir?: string;
    /** Custom artifact store for non-filesystem backends (DL#143) */
    artifactStore?: ArtifactStore;

    staticBaseUrl?: string;
    frontendDir?: string;

    /** Pre-imported plugin init modules — bypasses filesystem discovery (DL#143) */
    plugins?: PreImportedPlugin[];
    /** Pre-imported action modules — bypasses filesystem discovery (DL#143) */
    actionModules?: Array<{ module: Record<string, unknown>; name: string }>;

    /**
     * Cap on a JSON action request body in UTF-8 bytes (DL#234; default 1 MiB).
     * Custom bootstraps resolve it from the project `.jay` with `loadConfig` +
     * `resolveActionBodyLimitBytes` from `@jay-framework/stack-cli`, which also applies the
     * `JAY_SERVER_ACTION_BODY_LIMIT_BYTES` env override (DL#240).
     */
    actionBodyLimitBytes?: number;
    /** Max wait (ms) for the refresh of an `expired` instance (DL#226/#240); default 2000. */
    staleWaitMs?: number;
    /** Max wait (ms) of a render-on-miss before 503 (DL#227/#240); default 8000. */
    missTimeoutMs?: number;
    /** Max concurrent slow renders (DL#227/#240); default 5. */
    slowRenderConcurrency?: number;
    /** Emit the `jay-freshness` response header (DL#226/#240); default true. */
    freshnessHeader?: boolean;
}

export function createJayFetchHandler(
    options: JayFetchHandlerOptions,
): (request: Request) => Promise<Response> {
    const { staticBaseUrl = '/', frontendDir } = options;
    const artifacts = options.artifactStore ?? new FilesystemArtifactStore(options.backendDir!);
    const backendDir = options.backendDir;
    // Refresh + render-on-miss (DL#226/#227); inert when the store has no `writeCacheData`.
    const renderer = new InstanceRenderer(artifacts, {
        concurrency: options.slowRenderConcurrency,
        missTimeoutMs: options.missTimeoutMs,
    });
    const logger = getLogger();
    let initialized = false;

    async function initialize() {
        const manifest = await artifacts.readManifest();
        logger.info(
            `[FetchHandler] Loaded manifest: ${manifest.routes.length} routes, v${manifest.version}`,
        );

        if (options.plugins) {
            await initializeServicesFromModules(options.plugins, 'FetchHandler');
        } else if (backendDir) {
            await initializeServices(backendDir, process.cwd(), 'FetchHandler');
        }

        if (options.actionModules) {
            await registerActionsFromModules(options.actionModules);
        } else if (manifest.actions.length > 0 && backendDir) {
            await registerActionsFromManifest(manifest.actions, backendDir);
        }

        initialized = true;
    }

    return async (request: Request): Promise<Response> => {
        if (!initialized) {
            await initialize();
        }

        const url = new URL(request.url);

        if (isActionRequest(url.pathname)) {
            return fetchActionRequest(request, undefined, {
                actionBodyLimitBytes: options.actionBodyLimitBytes,
            });
        }

        if (frontendDir) {
            const staticResponse = await fetchStaticFile(url.pathname, frontendDir);
            if (staticResponse) return staticResponse;
        }

        const manifest = await artifacts.readManifest();
        const resolved = await resolveRequest(manifest, url.pathname, artifacts, renderer);

        if (resolved.kind === 'redirect') {
            return new Response(null, {
                status: resolved.status,
                headers: { Location: resolved.location },
            });
        }
        if (resolved.kind === 'unavailable') {
            return new Response('Service Unavailable', {
                status: 503,
                headers: {
                    'Retry-After': String(resolved.retryAfterSeconds),
                    'Cache-Control': 'no-store',
                },
            });
        }
        if (resolved.kind === 'notFound') {
            return new Response('Not Found', { status: 404 });
        }

        const cookies = parseCookies(request.headers.get('cookie'));
        return fetchPageRequest(
            resolved.match,
            manifest,
            url,
            artifacts,
            staticBaseUrl,
            cookies,
            renderer,
            {
                staleWaitMs: options.staleWaitMs,
                freshnessHeader: options.freshnessHeader,
            },
        );
    };
}
