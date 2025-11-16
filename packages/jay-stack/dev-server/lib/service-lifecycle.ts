/**
 * Service lifecycle management for the Jay Stack dev-server.
 *
 * Handles loading jay.init.ts, running init/shutdown callbacks,
 * hot reloading services, and graceful shutdown.
 */

import {
    runInitCallbacks,
    runShutdownCallbacks,
    clearLifecycleCallbacks,
    clearServiceRegistry,
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
     * Initializes services by loading and executing jay.init.ts
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            console.warn('[Services] Already initialized, skipping...');
            return;
        }

        this.initFilePath = this.findInitFile();

        if (!this.initFilePath) {
            console.log('[Services] No jay.init.ts found in src/, skipping service initialization');
            return;
        }

        console.log(`[Services] Loading initialization file: ${this.initFilePath}`);

        try {
            // Use Vite's SSR module loader if available (handles TypeScript)
            // Otherwise fall back to native import (requires .js files)
            if (this.viteServer) {
                // Load jay.init.ts through Vite
                await this.viteServer.ssrLoadModule(this.initFilePath);

                // Load the runtime module through Vite to ensure same module instance
                const runtimeModule = await this.viteServer.ssrLoadModule(
                    '@jay-framework/stack-server-runtime',
                );

                // Execute registered init callbacks
                await runtimeModule.runInitCallbacks();
            } else {
                // Convert file path to file URL for ES module import
                const fileUrl = pathToFileURL(this.initFilePath).href;
                await import(fileUrl);

                // Execute registered init callbacks
                await runInitCallbacks();
            }

            this.isInitialized = true;
            console.log('[Services] Initialization complete');
        } catch (error) {
            console.error('[Services] Failed to initialize:', error);
            throw error;
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
            // Load shutdown callbacks through Vite if available
            if (this.viteServer) {
                const runtimeModule = await this.viteServer.ssrLoadModule(
                    '@jay-framework/stack-server-runtime',
                );

                await Promise.race([
                    runtimeModule.runShutdownCallbacks(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Shutdown timeout')), timeoutMs),
                    ),
                ]);
            } else {
                await Promise.race([
                    runShutdownCallbacks(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Shutdown timeout')), timeoutMs),
                    ),
                ]);
            }

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
        if (!this.initFilePath) {
            console.log('[Services] No init file to reload');
            return;
        }

        console.log('[Services] Reloading services...');

        // Step 1: Graceful shutdown
        await this.shutdown();

        // Step 2: Clear all caches - use Vite's module if available
        if (this.viteServer) {
            const runtimeModule = await this.viteServer.ssrLoadModule(
                '@jay-framework/stack-server-runtime',
            );
            runtimeModule.clearLifecycleCallbacks();
            runtimeModule.clearServiceRegistry();

            // Invalidate Vite's module cache
            const moduleNode = this.viteServer.moduleGraph.getModuleById(this.initFilePath);
            if (moduleNode) {
                await this.viteServer.moduleGraph.invalidateModule(moduleNode);
            }
        } else {
            clearLifecycleCallbacks();
            clearServiceRegistry();

            // Clear Node.js module cache
            delete require.cache[require.resolve(this.initFilePath)];
        }

        // Step 3: Re-import and re-initialize
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
