/**
 * Service lifecycle management for the Jay Stack dev-server.
 *
 * Handles loading jay.init.ts, running init/shutdown callbacks,
 * hot reloading services, graceful shutdown, and action auto-discovery.
 */

import {
    runInitCallbacks,
    runShutdownCallbacks,
    clearLifecycleCallbacks,
    clearServiceRegistry,
    clearClientInitData,
    discoverAndRegisterActions,
    discoverAllPluginActions,
    actionRegistry,
    discoverPluginsWithInit,
    sortPluginsByDependencies,
    executePluginServerInits,
    type PluginWithInit,
} from '@jay-framework/stack-server-runtime';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { ViteDevServer } from 'vite';

export class ServiceLifecycleManager {
    private initFilePath: string | null = null;
    private clientInitFilePath: string | null = null;
    private isInitialized = false;
    private viteServer: ViteDevServer | null = null;
    private pluginsWithInit: PluginWithInit[] = [];

    constructor(
        private projectRoot: string,
        private sourceBase: string = 'src',
    ) {}

    /**
     * Set the Vite server instance for SSR module loading
     */
    setViteServer(viteServer: ViteDevServer): void {
        this.viteServer = viteServer;
    }

    /**
     * Finds the jay.init.ts (or .js) file in the source directory.
     * Looks in: {projectRoot}/{sourceBase}/jay.init.{ts,js,mts,mjs}
     */
    private findInitFile(): string | null {
        return this.findFileWithExtensions('jay.init');
    }

    /**
     * Finds the jay.client-init.ts (or .js) file in the source directory.
     * Looks in: {projectRoot}/{sourceBase}/jay.client-init.{ts,js,mts,mjs}
     */
    private findClientInitFile(): string | null {
        return this.findFileWithExtensions('jay.client-init');
    }

    /**
     * Helper to find a file with various extensions.
     */
    private findFileWithExtensions(baseFilename: string): string | null {
        const extensions = ['.ts', '.js', '.mts', '.mjs'];

        for (const ext of extensions) {
            const filePath = path.join(this.projectRoot, this.sourceBase, baseFilename + ext);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        return null;
    }

    /**
     * Initializes services by:
     * 1. Discovering and executing plugin server inits (in dependency order)
     * 2. Loading and executing project jay.init.ts
     * 3. Running all registered onInit callbacks
     * 4. Auto-discovering and registering actions
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('[Services] Already initialized, skipping...');
            return;
        }

        this.initFilePath = this.findInitFile();
        this.clientInitFilePath = this.findClientInitFile();

        // Step 1: Discover plugins with init configurations
        const discoveredPlugins = await discoverPluginsWithInit({
            projectRoot: this.projectRoot,
            verbose: true,
        });
        this.pluginsWithInit = sortPluginsByDependencies(discoveredPlugins);

        if (this.pluginsWithInit.length > 0) {
            console.log(
                `[Services] Found ${this.pluginsWithInit.length} plugin(s) with init: ${this.pluginsWithInit.map((p) => p.name).join(', ')}`,
            );
        }

        // Step 2: Execute plugin server inits (in dependency order)
        await executePluginServerInits(
            this.pluginsWithInit,
            this.viteServer ?? undefined,
            true,
        );

        // Step 3: Load project jay.init.ts (last, so it can depend on plugin services)
        if (this.initFilePath) {
            console.log(`[Services] Loading project initialization file: ${this.initFilePath}`);

            try {
                // Load jay.init.ts through Vite's SSR loader (handles TypeScript)
                // Vite is configured to treat @jay-framework/stack-server-runtime as external,
                // so both this file and jay.init.ts will share the same module instance
                if (this.viteServer) {
                    await this.viteServer.ssrLoadModule(this.initFilePath);
                } else {
                    // Fallback for production: use native import (requires .js files)
                    const fileUrl = pathToFileURL(this.initFilePath).href;
                    await import(fileUrl);
                }
            } catch (error) {
                console.error('[Services] Failed to load project init:', error);
                throw error;
            }
        } else {
            console.log('[Services] No jay.init.ts found in src/, skipping project service initialization');
        }

        // Step 4: Execute all registered init callbacks (from plugins and project)
        await runInitCallbacks();
        console.log('[Services] Initialization complete');

        // Step 5: Auto-discover and register actions from src/actions/
        await this.discoverActions();

        this.isInitialized = true;
    }

    /**
     * Auto-discovers and registers actions from project and plugins.
     */
    private async discoverActions(): Promise<void> {
        let totalActions = 0;

        // Discover project actions from src/actions/
        try {
            const result = await discoverAndRegisterActions({
                projectRoot: this.projectRoot,
                actionsDir: path.join(this.sourceBase, 'actions'),
                registry: actionRegistry,
                verbose: true,
                viteServer: this.viteServer ?? undefined,
            });

            totalActions += result.actionCount;
        } catch (error) {
            console.error('[Actions] Failed to auto-discover project actions:', error);
        }

        // Discover plugin actions from src/plugins/
        try {
            const pluginActions = await discoverAllPluginActions({
                projectRoot: this.projectRoot,
                registry: actionRegistry,
                verbose: true,
                viteServer: this.viteServer ?? undefined,
            });

            totalActions += pluginActions.length;
        } catch (error) {
            console.error('[Actions] Failed to auto-discover plugin actions:', error);
        }

        if (totalActions > 0) {
            console.log(`[Actions] Auto-registered ${totalActions} action(s) total`);
        }
    }

    /**
     * Shuts down services gracefully with timeout
     */
    async shutdown(timeoutMs: number = 5000): Promise<void> {
        if (!this.isInitialized) {
            return;
        }

        console.log('[Services] Shutting down...');

        try {
            // Use the same stack-server-runtime instance due to Vite's external config
            await Promise.race([
                runShutdownCallbacks(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Shutdown timeout')), timeoutMs),
                ),
            ]);

            console.log('[Services] Shutdown complete');
        } catch (error) {
            if (error.message === 'Shutdown timeout') {
                console.warn('[Services] Shutdown timed out after', timeoutMs, 'ms');
            } else {
                console.error('[Services] Shutdown error:', error);
            }
        } finally {
            this.isInitialized = false;
        }
    }

    /**
     * Hot reload: shutdown, clear caches, re-import, and re-initialize
     */
    async reload(): Promise<void> {
        console.log('[Services] Reloading services...');

        // Step 1: Graceful shutdown
        await this.shutdown();

        // Step 2: Clear all caches
        // Uses the same stack-server-runtime instance due to Vite's external config
        clearLifecycleCallbacks();
        clearServiceRegistry();
        clearClientInitData();
        actionRegistry.clear();

        // Step 3: Invalidate module caches
        if (this.initFilePath && this.viteServer) {
            // Invalidate Vite's module cache for jay.init.ts
            const moduleNode = this.viteServer.moduleGraph.getModuleById(this.initFilePath);
            if (moduleNode) {
                await this.viteServer.moduleGraph.invalidateModule(moduleNode);
            }
        } else if (this.initFilePath) {
            // Clear Node.js module cache (production fallback)
            delete require.cache[require.resolve(this.initFilePath)];
        }

        // Step 4: Re-import and re-initialize
        this.isInitialized = false;
        await this.initialize();

        console.log('[Services] Reload complete');
    }

    /**
     * Returns the path to the server init file if found
     */
    getInitFilePath(): string | null {
        return this.initFilePath;
    }

    /**
     * Returns the path to the client init file if found
     */
    getClientInitFilePath(): string | null {
        return this.clientInitFilePath;
    }

    /**
     * Returns the discovered plugins with init configurations.
     * Sorted by dependencies (plugins with no deps first).
     */
    getPluginsWithInit(): PluginWithInit[] {
        return this.pluginsWithInit;
    }

    /**
     * Checks if services are initialized
     */
    isReady(): boolean {
        return this.isInitialized;
    }
}
