/**
 * Dev Server Service — public API for design board applications, CLI, and plugins (DL#128, DL#130).
 *
 * Encapsulates route listing, param discovery, and freeze management.
 * Returned from mkDevServer and registered as a Jay service so plugin
 * components and actions can inject it via `.withServices(DEV_SERVER_SERVICE)`.
 */

import type { ViteDevServer } from 'vite';
import { createJayService } from '@jay-framework/fullstack-component';
import type { JayRollupConfig } from '@jay-framework/rollup-plugin';
import type { FreezeStore } from './freeze';
import type { DevServerRoute } from './dev-server';
import { getLogger } from '@jay-framework/logger';
import { loadPageParts, runLoadParams } from '@jay-framework/stack-server-runtime';

/**
 * Service marker for DevServerService.
 * Use with `.withServices(DEV_SERVER_SERVICE)` in actions and components.
 */
export const DEV_SERVER_SERVICE = createJayService<DevServerService>('DevServerService');

export interface RouteInfo {
    path: string;
    jayHtmlPath: string;
    compPath: string;
}

export class DevServerService {
    constructor(
        private routes: DevServerRoute[],
        private vite: ViteDevServer,
        private pagesBase: string,
        private projectBase: string,
        private jayRollupConfig: JayRollupConfig,
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
     * Run loadParams for a route, yielding param batches as an async generator.
     * Loads all page parts (page component + keyed headless components) and
     * calls loadParams on each one that defines it.
     */
    async *loadRouteParams(routePath: string): AsyncGenerator<Record<string, string>[]> {
        const matched = this.routes.find((r) => r.path === routePath);
        if (!matched) {
            getLogger().error(`[loadRouteParams] Route [${routePath}] not found`);
            throw new Error(`Route "${routePath}" not found`);
        }

        const loaded = await loadPageParts(
            this.vite,
            matched.fsRoute,
            this.pagesBase,
            this.projectBase,
            this.jayRollupConfig,
        );

        if (!loaded.val) {
            return;
        }

        yield* runLoadParams(loaded.val.parts);
    }
}
