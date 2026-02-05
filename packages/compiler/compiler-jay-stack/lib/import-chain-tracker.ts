import { Plugin } from 'vite';
import { getLogger } from '@jay-framework/logger';

/**
 * Known server-only modules that should never appear in client builds.
 * When these are imported, we log the import chain to help debug.
 */
const SERVER_ONLY_MODULES = new Set([
    'module', // createRequire
    'fs',
    'path',
    'node:fs',
    'node:path',
    'node:module',
    'child_process',
    'node:child_process',
    'crypto',
    'node:crypto',
]);

/**
 * Known server-only package patterns.
 */
const SERVER_ONLY_PACKAGE_PATTERNS = [
    '@jay-framework/compiler-shared',
    '@jay-framework/stack-server-runtime',
    'yaml', // Often used in server config
];

export interface ImportChainTrackerOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Additional modules to treat as server-only */
    additionalServerModules?: string[];
    /** Additional package patterns to treat as server-only */
    additionalServerPatterns?: string[];
}

/**
 * Creates a Vite plugin that tracks import chains and logs when
 * server-only modules are imported in client builds.
 *
 * This helps debug issues where server code is accidentally pulled
 * into client bundles.
 */
export function createImportChainTracker(options: ImportChainTrackerOptions = {}): Plugin {
    const {
        verbose = false,
        additionalServerModules = [],
        additionalServerPatterns = [],
    } = options;

    // Map from module path to its importer
    const importChain = new Map<string, string>();

    // Set of detected server modules
    const detectedServerModules = new Set<string>();

    // Combined server-only modules
    const serverOnlyModules = new Set([...SERVER_ONLY_MODULES, ...additionalServerModules]);

    // Combined server-only patterns
    const serverOnlyPatterns = [...SERVER_ONLY_PACKAGE_PATTERNS, ...additionalServerPatterns];

    /**
     * Check if a module is server-only based on our lists.
     */
    function isServerOnlyModule(id: string): boolean {
        // Check exact matches
        if (serverOnlyModules.has(id)) {
            return true;
        }

        // Check patterns
        for (const pattern of serverOnlyPatterns) {
            if (id.includes(pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Build the import chain from a module back to the entry point.
     */
    function buildImportChain(moduleId: string): string[] {
        const chain: string[] = [moduleId];
        let current = moduleId;

        // Walk up the chain, limit to prevent infinite loops
        for (let i = 0; i < 100; i++) {
            const importer = importChain.get(current);
            if (!importer) break;
            chain.push(importer);
            current = importer;
        }

        return chain.reverse();
    }

    /**
     * Format the import chain for logging.
     */
    function formatChain(chain: string[]): string {
        return chain
            .map((id, idx) => {
                const indent = '  '.repeat(idx);
                const shortId = shortenPath(id);
                return `${indent}${idx === 0 ? '' : '↳ '}${shortId}`;
            })
            .join('\n');
    }

    /**
     * Shorten a path for readable logging.
     */
    function shortenPath(id: string): string {
        // Remove node_modules path components for brevity
        if (id.includes('node_modules')) {
            const parts = id.split('node_modules/');
            return parts[parts.length - 1];
        }

        // For project files, show relative path from project root
        const cwd = process.cwd();
        if (id.startsWith(cwd)) {
            return id.slice(cwd.length + 1);
        }

        return id;
    }

    return {
        name: 'jay-stack:import-chain-tracker',
        enforce: 'pre',

        buildStart() {
            // Clear state on new build
            importChain.clear();
            detectedServerModules.clear();

            if (verbose) {
                getLogger().info('[import-chain-tracker] Build started, tracking imports...');
            }
        },

        resolveId(source: string, importer: string | undefined, options) {
            // Only track in client builds
            if (options?.ssr) {
                return null;
            }

            // Skip virtual modules
            if (source.startsWith('\0')) {
                return null;
            }

            // Record the import relationship
            if (importer) {
                // We'll record the actual resolved ID in the load hook
                // For now, just note this import happened
                if (verbose) {
                    getLogger().info(
                        `[import-chain-tracker] ${shortenPath(importer)} imports ${source}`,
                    );
                }
            }

            return null; // Don't intercept, just observe
        },

        load(id: string) {
            // Only track in client builds (checked via resolved options)
            // Note: The load hook doesn't have options, so we track everything
            // and filter in buildEnd

            return null; // Don't intercept, just observe
        },

        transform(code: string, id: string, options) {
            // Only track in client builds
            if (options?.ssr) {
                return null;
            }

            // Check if this module is server-only
            if (isServerOnlyModule(id)) {
                detectedServerModules.add(id);

                // Build and log the import chain
                const chain = buildImportChain(id);
                getLogger().error(
                    `\n[import-chain-tracker] ⚠️  Server-only module detected in client build!`,
                );
                getLogger().error(`Module: ${shortenPath(id)}`);
                getLogger().error(`Import chain:`);
                getLogger().error(formatChain(chain));
                getLogger().error('');
            }

            // Track import statements in this file
            const importRegex = /import\s+(?:(?:\{[^}]*\}|[^{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g;
            let match;
            while ((match = importRegex.exec(code)) !== null) {
                const importedModule = match[1];
                importChain.set(importedModule, id);

                // Check for immediate server-only imports
                if (isServerOnlyModule(importedModule)) {
                    if (!detectedServerModules.has(importedModule)) {
                        detectedServerModules.add(importedModule);
                        getLogger().error(
                            `\n[import-chain-tracker] ⚠️  Server-only import detected in client build!`,
                        );
                        getLogger().error(
                            `Module "${importedModule}" imported by: ${shortenPath(id)}`,
                        );

                        // Build chain from the importer
                        const chain = buildImportChain(id);
                        chain.push(importedModule);
                        getLogger().error(`Import chain:`);
                        getLogger().error(formatChain(chain));
                        getLogger().error('');
                    }
                }
            }

            return null; // Don't transform, just observe
        },

        buildEnd() {
            if (detectedServerModules.size > 0) {
                getLogger().warn(
                    `\n[import-chain-tracker] ⚠️  ${detectedServerModules.size} server-only module(s) detected during transform:`,
                );
                for (const mod of detectedServerModules) {
                    getLogger().warn(`  - ${mod}`);
                }
                getLogger().warn(
                    '\nNote: These may be stripped by the code-split transform if only used in .withServer().',
                );
                getLogger().warn(
                    'If build fails with "not exported" errors, check the import chains above.\n',
                );
            } else if (verbose) {
                getLogger().info(
                    '[import-chain-tracker] ✅ No server-only modules detected in client build',
                );
            }
        },
    };
}
