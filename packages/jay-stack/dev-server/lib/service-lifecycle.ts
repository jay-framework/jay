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

export class ServiceLifecycleManager {
    private initFilePath: string | null = null;
    private isInitialized = false;

    constructor(private projectRoot: string) {}

    /**
     * Finds the jay.init.ts (or .js) file in the project root.
     */
    private findInitFile(): string | null {
        const extensions = ['.ts', '.js', '.mts', '.mjs'];
        const baseFilename = 'jay.init';

        for (const ext of extensions) {
            const filePath = path.join(this.projectRoot, baseFilename + ext);
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
            console.log('[Services] No jay.init.ts found, skipping service initialization');
            return;
        }

        console.log(`[Services] Loading initialization file: ${this.initFilePath}`);

        try {
            // Import the init file (registers hooks)
            await import(this.initFilePath);

            // Execute registered init callbacks
            await runInitCallbacks();

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
        if (!this.initFilePath) {
            console.log('[Services] No init file to reload');
            return;
        }

        console.log('[Services] Reloading services...');

        // Step 1: Graceful shutdown
        await this.shutdown();

        // Step 2: Clear all caches
        clearLifecycleCallbacks();
        clearServiceRegistry();

        // Step 3: Clear Node.js module cache
        delete require.cache[require.resolve(this.initFilePath)];
        // Also clear for ES modules
        const moduleURL = `file://${this.initFilePath}`;
        if (global.process?.versions?.node) {
            // Note: Module cache clearing for ES modules is limited
            // Best practice is to restart the server, but we try our best
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

