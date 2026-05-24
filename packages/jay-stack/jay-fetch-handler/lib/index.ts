import {
    FilesystemArtifactStore,
    matchRequest,
    fetchPageRequest,
    fetchActionRequest,
    isActionRequest,
    fetchStaticFile,
    registerActionsFromManifest,
    initializeServices,
} from '@jay-framework/production-server';
import { getLogger } from '@jay-framework/logger';

export interface JayFetchHandlerOptions {
    backendDir: string;
    staticBaseUrl?: string;
    frontendDir?: string;
}

export function createJayFetchHandler(
    options: JayFetchHandlerOptions,
): (request: Request) => Promise<Response> {
    const { backendDir, staticBaseUrl = '/', frontendDir } = options;
    const artifacts = new FilesystemArtifactStore(backendDir);
    const logger = getLogger();
    let initialized = false;

    async function initialize() {
        const manifest = await artifacts.readManifest();
        logger.info(
            `[FetchHandler] Loaded manifest: ${manifest.routes.length} routes, v${manifest.version}`,
        );

        await initializeServices(backendDir, process.cwd(), 'FetchHandler');

        if (manifest.actions.length > 0) {
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

        return fetchPageRequest(match, manifest, url, artifacts, staticBaseUrl);
    };
}
