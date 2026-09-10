/**
 * Dev Server Service — public API for design board applications, CLI, and plugins (DL#128, DL#130).
 *
 * Encapsulates route listing, param discovery, and freeze management.
 * Returned from mkDevServer and registered as a Jay service so plugin
 * components and actions can inject it via `.withServices(DEV_SERVER_SERVICE)`.
 */

import type { ViteDevServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createJayService } from '@jay-framework/fullstack-component';
import type { JayRollupConfig } from '@jay-framework/rollup-plugin';
import type { FreezeStore } from './freeze';
import type { DevServerRoute } from './dev-server';
import { getLogger } from '@jay-framework/logger';
import { runLoadParams } from '@jay-framework/stack-server-runtime';
import { generateFrozenPageHtml, loadPageParts } from '@jay-framework/stack-server-build';
import {
    renderScratchPagePreview,
    type ScratchPagePreviewInput,
    type ScratchPagePreviewResult,
} from './render-scratch-page-preview.js';
import type { DevHtmlRouteHandler } from './dev-html-routes.js';

/**
 * Service marker for DevServerService.
 * Use with `.withServices(DEV_SERVER_SERVICE)` in actions and components.
 */
export const DEV_SERVER_SERVICE = createJayService<DevServerService>('DevServerService');

export interface RouteInfo {
    path: string;
    jayHtmlPath: string;
    compPath: string;
    /** Dev-server tooling route — consumers like AIditor may filter from page pickers. */
    devOnly?: boolean;
}

export type DevServerRouteRegistrar = (routes: DevServerRoute[]) => void;

export type HeadfullComponentPreviewInput = {
    tsPath: string;
    jayHtmlPath: string;
    exportName: string;
    props: Record<string, unknown>;
};

export type HeadfullComponentPreviewResult =
    { ok: true; fragment: string } | { ok: false; error: string };

export type { ScratchPagePreviewInput, ScratchPagePreviewResult };

export class DevServerService {
    constructor(
        private routes: DevServerRoute[],
        private vite: ViteDevServer,
        private pagesBase: string,
        private projectBase: string,
        private jayRollupConfig: JayRollupConfig,
        private buildFolder: string,
        private _freezeStore?: FreezeStore,
        private rescanRoutes?: () => Promise<DevServerRoute[]>,
    ) {}

    private routeRegistrar?: DevServerRouteRegistrar;
    private readonly devHtmlRoutes = new Map<string, DevHtmlRouteHandler>();

    get freezeStore(): FreezeStore | undefined {
        return this._freezeStore;
    }

    /** Register new route handlers with Express (or another HTTP layer). */
    attachRouteRegistrar(registrar: DevServerRouteRegistrar): void {
        this.routeRegistrar = registrar;
    }

    /** Register a dev-only GET handler that returns raw HTML (not a Jay page route). */
    registerDevHtmlRoute(path: string, handler: DevHtmlRouteHandler): void {
        this.devHtmlRoutes.set(path, handler);
        getLogger().info(`[DevHtmlRoute] Registered ${path}`);
    }

    getDevHtmlRoute(path: string): DevHtmlRouteHandler | undefined {
        return this.devHtmlRoutes.get(path);
    }

    /**
     * Rescan the pages directory for new routes and register any that were
     * added since dev-server startup (e.g. after AIditor Add Page).
     */
    async refreshRoutes(): Promise<RouteInfo[]> {
        if (!this.rescanRoutes) {
            return this.listRoutes();
        }
        const added = await this.rescanRoutes();
        if (added.length > 0 && this.routeRegistrar) {
            this.routeRegistrar(added);
            getLogger().info(
                `[Routes] Registered ${added.length} new route(s): ${added.map((r) => r.fsRoute.rawRoute).join(', ')}`,
            );
        }
        return this.listRoutes();
    }

    /** List all page routes in the project (includes dev-only plugin routes). */
    listRoutes(): RouteInfo[] {
        return this.routes.map((r) => ({
            path: r.path,
            jayHtmlPath: r.fsRoute.jayHtmlPath,
            compPath: r.fsRoute.compPath,
            ...(r.fsRoute.devOnly && { devOnly: true }),
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

    /**
     * SSR-render a headfull component template with sample props.
     * Returns an HTML fragment (inline CSS + markup) suitable for shadow DOM mounting.
     */
    async renderHeadfullComponentFragment(
        input: HeadfullComponentPreviewInput,
    ): Promise<HeadfullComponentPreviewResult> {
        try {
            const componentModule = await this.vite.ssrLoadModule(input.tsPath);
            const componentExport = componentModule[input.exportName] as {
                slowlyRender?: (
                    props: Record<string, unknown>,
                    ...services: unknown[]
                ) => Promise<{ kind: string; rendered?: Record<string, unknown> }>;
            };
            if (!componentExport?.slowlyRender) {
                return {
                    ok: false,
                    error: `Export "${input.exportName}" has no slowlyRender phase`,
                };
            }

            const slowResult = await componentExport.slowlyRender(input.props);
            if (slowResult.kind !== 'PhaseOutput' || !slowResult.rendered) {
                return {
                    ok: false,
                    error: `slowlyRender did not return PhaseOutput for "${input.exportName}"`,
                };
            }

            const jayHtmlDir = path.dirname(input.jayHtmlPath);
            const jayHtmlFilename = path.basename(input.jayHtmlPath);
            const jayHtmlContent = await fs.readFile(input.jayHtmlPath, 'utf-8');
            const srcRoot = path.join(this.projectBase, 'src');
            const routeDir = path.relative(srcRoot, jayHtmlDir);
            const sourceDir = srcRoot;

            const fragment = await generateFrozenPageHtml(
                this.vite,
                jayHtmlContent,
                jayHtmlFilename,
                jayHtmlDir,
                slowResult.rendered,
                this.buildFolder,
                this.projectBase,
                routeDir,
                this.jayRollupConfig?.tsConfigFilePath,
                sourceDir,
                'fragment',
            );

            return { ok: true, fragment };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            getLogger().warn(`[HeadfullPreview] ${message}`);
            return { ok: false, error: message };
        }
    }

    /**
     * SSR-render a scratch explore option page.jay-html with production ViewState.
     * Returns a full HTML document suitable for iframe blob mounting.
     */
    async renderScratchPagePreview(
        input: ScratchPagePreviewInput,
    ): Promise<ScratchPagePreviewResult> {
        const matched = this.routes.find((route) => route.path === input.routePath);
        if (!matched) {
            return {
                ok: false,
                error: `Route "${input.routePath}" not found`,
            };
        }
        return renderScratchPagePreview(
            this.vite,
            matched.fsRoute,
            input,
            this.pagesBase,
            this.projectBase,
            this.buildFolder,
            this.jayRollupConfig,
        );
    }
}
