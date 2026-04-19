/**
 * Dev Server Service — public API for design board applications, CLI, and plugins (DL#128, DL#130).
 *
 * Encapsulates route listing, param discovery, and freeze management.
 * Returned from mkDevServer and registered as a Jay service so plugin
 * components and actions can inject it via `.withServices(DEV_SERVER_SERVICE)`.
 */

import type { ViteDevServer } from 'vite';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import { createJayService } from '@jay-framework/fullstack-component';
import type { FreezeStore, FreezeEntry } from './freeze';
import type { DevServerRoute } from './dev-server';

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
     * Throws if the route doesn't exist or has no loadParams.
     */
    async *loadRouteParams(routePath: string): AsyncGenerator<Record<string, string>[]> {
        const matched = this.routes.find((r) => r.path === routePath);
        if (!matched) {
            throw new Error(`Route "${routePath}" not found`);
        }

        const module = await this.vite.ssrLoadModule(matched.fsRoute.compPath);
        const component = module.page;

        if (!component?.loadParams) {
            throw new Error(`Route "${routePath}" has no loadParams`);
        }

        const { resolveServices } = await import('@jay-framework/stack-server-runtime');
        const services = resolveServices(component.services || []);

        yield* component.loadParams(services);
    }
}
