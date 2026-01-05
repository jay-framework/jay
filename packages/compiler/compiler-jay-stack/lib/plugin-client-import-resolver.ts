/**
 * Plugin Client Import Resolver
 *
 * Transforms imports from Jay plugin packages to use their /client subpath
 * when in client build mode.
 *
 * This handles transitive plugin dependencies: when wix-stores imports from
 * wix-server-client, the import should be rewritten to wix-server-client/client
 * in client builds.
 *
 * Uses a `transform` hook instead of `resolveId` to ensure the rewrite happens
 * before rollup's `external` option is evaluated.
 *
 * Detection:
 * 1. Check if the imported package has a plugin.yaml (is a Jay plugin)
 * 2. Check if the package exports a /client subpath
 * 3. If both true, rewrite the import to use /client
 */

import type { Plugin } from 'vite';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ============================================================================
// Plugin Detection Interface (injectable for testing)
// ============================================================================

/**
 * Interface for detecting if a package is a Jay plugin with /client export.
 * Extracted to allow mocking in tests.
 */
export interface PluginDetector {
    /**
     * Checks if a package is a Jay plugin with a /client export.
     * @param packageName - The package name (e.g., '@jay-framework/wix-stores')
     * @param projectRoot - The project root for resolution
     * @returns true if the package should be rewritten to /client
     */
    isJayPluginWithClientExport(packageName: string, projectRoot: string): boolean;
}

/**
 * Default implementation using Node's require.resolve.
 */
export function createDefaultPluginDetector(): PluginDetector {
    // Cache for plugin detection (packageName -> hasClientExport)
    const cache = new Map<string, boolean>();

    return {
        isJayPluginWithClientExport(packageName: string, projectRoot: string): boolean {
            const cacheKey = `${packageName}:${projectRoot}`;
            if (cache.has(cacheKey)) {
                return cache.get(cacheKey)!;
            }

            let result = false;

            try {
                // Try to resolve plugin.yaml - if it exists, this is a Jay plugin
                require.resolve(`${packageName}/plugin.yaml`, { paths: [projectRoot] });

                // Now check if the package has a /client export
                try {
                    require.resolve(`${packageName}/client`, { paths: [projectRoot] });
                    result = true;
                } catch {
                    // Package is a plugin but doesn't have /client export
                    result = false;
                }
            } catch {
                // Not a Jay plugin
                result = false;
            }

            cache.set(cacheKey, result);
            return result;
        },
    };
}

// ============================================================================
// Import Transformation Logic (pure functions, no IO)
// ============================================================================

/**
 * Extracts the package name from an import source.
 * Handles scoped packages like @jay-framework/wix-stores.
 */
export function extractPackageName(source: string): string | null {
    // Skip relative imports
    if (source.startsWith('.') || source.startsWith('/')) {
        return null;
    }

    // Handle scoped packages (@scope/package)
    if (source.startsWith('@')) {
        const parts = source.split('/');
        if (parts.length >= 2) {
            return `${parts[0]}/${parts[1]}`;
        }
        return null;
    }

    // Handle regular packages
    const parts = source.split('/');
    return parts[0];
}

/**
 * Checks if the import is already using a subpath (not just the main entry).
 */
export function isSubpathImport(source: string, packageName: string): boolean {
    // If source is longer than package name, it's a subpath import
    return source.length > packageName.length && source[packageName.length] === '/';
}

/**
 * Regex to match import declarations.
 * Captures:
 * - Group 1: import clause (what's being imported)
 * - Group 2: the quote character (' or ")
 * - Group 3: the module specifier
 *
 * Matches patterns like:
 * - import { foo } from 'package'
 * - import { foo, bar } from "package"
 * - import foo from 'package'
 * - import * as foo from 'package'
 */
const IMPORT_REGEX = /import\s+(.+?)\s+from\s+(['"])([^'"]+)\2/g;

/**
 * Regex to match export from declarations.
 * Matches patterns like:
 * - export { foo } from 'package'
 * - export * from 'package'
 */
const EXPORT_FROM_REGEX = /export\s+(.+?)\s+from\s+(['"])([^'"]+)\2/g;

export interface TransformImportsOptions {
    /** The source code to transform */
    code: string;
    /** Project root for plugin detection */
    projectRoot: string;
    /** File path for logging */
    filePath: string;
    /** Plugin detector (injectable for testing) */
    pluginDetector: PluginDetector;
    /** Enable verbose logging */
    verbose?: boolean;
}

export interface TransformImportsResult {
    /** The transformed code */
    code: string;
    /** Whether any changes were made */
    hasChanges: boolean;
}

/**
 * Transforms import/export declarations in source code.
 * Rewrites plugin package imports to use /client subpath.
 *
 * This is a pure function - all IO is handled by the pluginDetector.
 */
export function transformImports(options: TransformImportsOptions): TransformImportsResult {
    const { code, projectRoot, filePath, pluginDetector, verbose = false } = options;

    let hasChanges = false;
    let result = code;

    // Process import declarations
    result = result.replace(IMPORT_REGEX, (match, clause, quote, source) => {
        const packageName = extractPackageName(source);
        if (!packageName) return match;
        if (isSubpathImport(source, packageName)) return match;
        if (!pluginDetector.isJayPluginWithClientExport(packageName, projectRoot)) return match;

        hasChanges = true;
        const newSource = `${packageName}/client`;

        if (verbose) {
            console.log(
                `[plugin-client-import] Rewriting import ${source} -> ${newSource} (in ${path.basename(filePath)})`,
            );
        }

        return `import ${clause} from ${quote}${newSource}${quote}`;
    });

    // Process export from declarations
    result = result.replace(EXPORT_FROM_REGEX, (match, clause, quote, source) => {
        const packageName = extractPackageName(source);
        if (!packageName) return match;
        if (isSubpathImport(source, packageName)) return match;
        if (!pluginDetector.isJayPluginWithClientExport(packageName, projectRoot)) return match;

        hasChanges = true;
        const newSource = `${packageName}/client`;

        if (verbose) {
            console.log(
                `[plugin-client-import] Rewriting export ${source} -> ${newSource} (in ${path.basename(filePath)})`,
            );
        }

        return `export ${clause} from ${quote}${newSource}${quote}`;
    });

    return { code: result, hasChanges };
}

// ============================================================================
// Vite Plugin
// ============================================================================

export interface PluginClientImportResolverOptions {
    /** Project root directory for resolution */
    projectRoot?: string;
    /** Enable verbose logging */
    verbose?: boolean;
    /** Custom plugin detector (for testing) */
    pluginDetector?: PluginDetector;
}

/**
 * Creates a Vite plugin that transforms plugin package imports to /client
 * in client builds.
 *
 * Uses the `transform` hook to rewrite import declarations before rollup's
 * external option is evaluated.
 */
export function createPluginClientImportResolver(
    options: PluginClientImportResolverOptions = {},
): Plugin {
    const { verbose = false } = options;
    let projectRoot = options.projectRoot || process.cwd();
    let isSSRBuild = false;
    const pluginDetector = options.pluginDetector || createDefaultPluginDetector();

    return {
        name: 'jay-stack:plugin-client-import',
        enforce: 'pre',

        configResolved(config) {
            projectRoot = config.root || projectRoot;
            // config.build.ssr can be boolean or string (entry path) - coerce to boolean
            isSSRBuild = !!config.build?.ssr;
        },

        transform(code, id, transformOptions) {
            // Skip SSR builds - use main entry on server
            if (transformOptions?.ssr || isSSRBuild) {
                return null;
            }

            // Only transform TypeScript/JavaScript files
            if (
                !id.endsWith('.ts') &&
                !id.endsWith('.js') &&
                !id.includes('.ts?') &&
                !id.includes('.js?')
            ) {
                return null;
            }

            // Skip node_modules except for our packages that might need transformation
            // (e.g., symlinked workspace packages in dev)
            if (id.includes('node_modules') && !id.includes('@jay-framework')) {
                return null;
            }

            // Quick check: does the code contain any potential plugin imports?
            if (
                !code.includes('@jay-framework/') &&
                !code.includes("from '@") &&
                !code.includes('from "@')
            ) {
                return null;
            }

            const result = transformImports({
                code,
                projectRoot,
                filePath: id,
                pluginDetector,
                verbose,
            });

            if (!result.hasChanges) {
                return null;
            }

            return { code: result.code };
        },
    };
}
