import {
    type ArtifactStore,
    type PreImportedPlugin,
    FilesystemArtifactStore,
    matchRequest,
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
}

export function createJayFetchHandler(
    options: JayFetchHandlerOptions,
): (request: Request) => Promise<Response> {
    const { staticBaseUrl = '/', frontendDir } = options;
    const artifacts = options.artifactStore ?? new FilesystemArtifactStore(options.backendDir!);
    const backendDir = options.backendDir;
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
            return fetchActionRequest(request);
        }

        if (frontendDir) {
            const staticResponse = await fetchStaticFile(url.pathname, frontendDir);
            if (staticResponse) return staticResponse;
        }

        const manifest = await artifacts.readManifest();
        const match = matchRequest(manifest, url.pathname);

        if (!match) {
            return new Response('Not Found', { status: 404 });
        }

        const cookies = parseCookies(request.headers.get('cookie'));
        return fetchPageRequest(match, manifest, url, artifacts, staticBaseUrl, cookies);
    };
}
