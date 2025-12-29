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
    discoverAndRegisterActions,
    discoverAllPluginActions,
    actionRegistry,
} from '@jay-framework/stack-server-runtime';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { ViteDevServer } from 'vite';

export class ServiceLifecycleManager {
    private initFilePath: string | null = null;
    private isInitialized = false;
    private viteServer: ViteDevServer | null = null;

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
        const extensions = ['.ts', '.js', '.mts', '.mjs'];
        const baseFilename = 'jay.init';

        for (const ext of extensions) {
            const filePath = path.join(this.projectRoot, this.sourceBase, baseFilename + ext);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        return null;
    }

    /**
     * Initializes services by loading and executing jay.init.ts,
     * then auto-discovers and registers actions.
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('[Services] Already initialized, skipping...');
            return;
        }

        this.initFilePath = this.findInitFile();

        if (this.initFilePath) {
            console.log(`[Services] Loading initialization file: ${this.initFilePath}`);

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

                // Execute registered init callbacks
                // This works because Vite uses Node's require for stack-server-runtime (external)
                await runInitCallbacks();

                console.log('[Services] Initialization complete');
            } catch (error) {
                console.error('[Services] Failed to initialize:', error);
                throw error;
            }
        } else {
            console.log('[Services] No jay.init.ts found in src/, skipping service initialization');
        }

        // Auto-discover and register actions from src/actions/
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
     * Returns the path to the init file if found
     */
    getInitFilePath(): string | null {
        return this.initFilePath;
    }

    /**
     * Checks if services are initialized
     */
    isReady(): boolean {
        return this.isInitialized;
    }
}
