/**
 * Dev Server Service — public API for design board applications and CLI (DL#128).
 *
 * Encapsulates route listing, param discovery, and freeze management.
 * Returned from mkDevServer and wired into the editor protocol by the CLI.
 */

import type { ViteDevServer } from 'vite';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { FreezeStore, FreezeEntry } from './freeze';
import type { DevServerRoute } from './dev-server';

export interface RouteInfo {
    path: string;
    jayHtmlPath: string;
    compPath: string;
}

export interface RouteParamsBatch {
    params: Record<string, string>[];
    hasMore: boolean;
}

export class DevServerService {
    constructor(
        private routes: DevServerRoute[],
        private vite: ViteDevServer,
        private _freezeStore?: FreezeStore,
    ) {}

    get freezeStore(): FreezeStore | undefined {
        return this._freezeStore;
    }

    /** List all page routes in the project. */
    listRoutes(): RouteInfo[] {
        return this.routes.map((r) => ({
            path: r.path,
            jayHtmlPath: r.fsRoute.jayHtmlPath,
            compPath: r.fsRoute.compPath,
        }));
    }

    /**
     * Run loadParams for a route and call the callback for each batch.
     * Returns false if the route doesn't exist or has no loadParams.
     */
    async loadRouteParams(
        routePath: string,
        onBatch: (batch: RouteParamsBatch) => void,
    ): Promise<{ success: boolean; error?: string }> {
        const matched = this.routes.find((r) => r.path === routePath);
        if (!matched) {
            return { success: false, error: `Route "${routePath}" not found` };
        }

        try {
            const module = await this.vite.ssrLoadModule(matched.fsRoute.compPath);
            const component = module.page;

            if (!component?.loadParams) {
                return { success: false, error: `Route "${routePath}" has no loadParams` };
            }

            const { resolveServices } = await import('@jay-framework/stack-server-runtime');
            const services = resolveServices(component.services || []);

            // Run generator and stream batches
            const generator = component.loadParams(services);
            for await (const batch of generator) {
                onBatch({ params: batch, hasMore: true });
            }
            onBatch({ params: [], hasMore: false });

            return { success: true };
        } catch (err: any) {
            onBatch({ params: [], hasMore: false });
            return { success: false, error: err.message };
        }
    }
}
