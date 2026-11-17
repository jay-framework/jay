import { Contract, parseContract } from '../contract';
import {
    createTypeAnalyzer,
    ResolveTsConfigOptions,
} from '@jay-framework/compiler-analyze-exported-types';
import {
    JayType,
    WithValidations,
    resolvePluginComponent as resolvePlugin,
    PluginComponentResolution,
    resolvePluginManifest,
    PluginManifest,
} from '@jay-framework/compiler-shared';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import YAML from 'yaml';

const require = createRequire(import.meta.url);

export type { PluginComponentResolution };

/**
 * Owns type-analysis state for one scope (DL#225). The TS type analysis (`ts.createProgram` inside
 * `analyzeExportedTypes`) costs ~hundreds of ms per component file, and `parseJayFile` re-analyzes every
 * local `src=` import on every call — once per SSR request in the dev server. A context memoizes results
 * so repeat requests (and a component imported by many pages at build time) don't re-analyze.
 *
 * A context is created per owner (dev-server session, build run, CLI command, or **test**) and threaded
 * through the resolver — not a module global — so the state's lifetime is the owner's and tests are
 * isolated. DL#225 Phase 3 will make the context own a persistent `ts.LanguageService` here.
 */
export interface AnalysisContext {
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
    /**
     * Invalidate after a `.ts` / `.d.ts` / `.jay-contract` change. The cache keys on the analyzed file's
     * own mtime (busts a direct edit), but a change to a *type it imports* (e.g. a regenerated contract
     * `.d.ts`) without touching the component is not seen by mtime — so the dev-server watcher calls this.
     * Currently clears everything (cheap; next request re-analyzes only the pages it renders).
     */
    noteFileChanged(changedPath?: string): void;
    /** Clear all cached analysis. */
    clear(): void;
}

/**
 * Create a fresh {@link AnalysisContext}. Each owner creates its own; callers thread it via the resolver.
 * Backed by a persistent `ts.LanguageService` (DL#225) so repeat/incremental analysis is near-free and the
 * cold `createProgram` cost is shared across a session.
 */
export function createAnalysisContext(): AnalysisContext {
    const analyzer = createTypeAnalyzer();
    return {
        analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[] {
            return analyzer.analyze(fullPath, options);
        },
        noteFileChanged(changedPath?: string): void {
            // A specific edit → bump that file's version (incremental). No path → full reset.
            if (changedPath) analyzer.noteFileChanged(changedPath);
            else analyzer.clear();
        },
        clear(): void {
            analyzer.clear();
        },
    };
}

export interface JayImportResolver {
    resolveLink(importingModuleDir: string, link: string): string;
    /** Load a contract from an absolute file path */
    loadContract(fullPath: string): WithValidations<Contract>;
    analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
    resolvePluginComponent(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<PluginComponentResolution>;
    /**
     * Load a contract from a plugin, handling both static and dynamic contracts.
     * For static contracts, loads from the plugin's contract file.
     * For dynamic contracts, loads from materialized location (agent-kit/materialized-contracts/).
     *
     * Returns the contract, path, and optional metadata (for dynamic contracts).
     */
    loadPluginContract(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<{
        contract: Contract;
        contractPath: string;
        metadata?: Record<string, unknown>;
    }>;
    resolvePluginManifest(pluginName: string, projectRoot: string): WithValidations<PluginManifest>;
    /**
     * Read a jay-html file adjacent to a component module.
     * Given a module src path (e.g., "./header/header"), resolves to the absolute path
     * and reads the corresponding .jay-html file. Tries two conventions:
     * 1. File-based: `<src>.jay-html` (e.g., `header/header.jay-html`)
     * 2. Directory-based: `<src>/<basename>.jay-html` (e.g., `header/header/header.jay-html`)
     * Returns the file content and the directory containing the jay-html file, or null if not found.
     */
    readJayHtml(
        importingModuleDir: string,
        src: string,
    ): { content: string; componentDir: string; filePath: string } | null;
}

/**
 * The resolver methods that are stateless (everything except `analyzeExportedTypes`, which is bound to an
 * {@link AnalysisContext} in {@link createJayImportResolver}).
 */
const baseResolverMethods: Omit<JayImportResolver, 'analyzeExportedTypes'> = {
    loadContract(fullPath: string): WithValidations<Contract> {
        const content = fs.readFileSync(fullPath).toString();
        return parseContract(content, fullPath);
    },
    resolveLink(importingModuleDir: string, link: string): string {
        // Relative link ("./x") — resolve against the importing dir.
        if (link?.[0] === '.') return path.resolve(importingModuleDir, link);
        // Absolute file path ("/abs/x") — used after pre-render absolutizes headless src=.
        // Return as-is (extensionless); analyzeExportedTypes' autoAddExtension appends .ts.
        if (link?.[0] === '/') return link;
        // Bare module specifier ("pkg/component") — resolve through node.
        return require.resolve(link, { paths: require.resolve.paths(importingModuleDir) });
    },
    resolvePluginComponent(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<PluginComponentResolution> {
        // Use shared plugin resolution logic from compiler-shared
        // This handles both local plugins (src/plugins/) and NPM packages (node_modules/)
        return resolvePlugin(projectRoot, pluginName, contractName);
    },
    loadPluginContract(
        pluginName: string,
        contractName: string,
        projectRoot: string,
    ): WithValidations<{ contract: Contract; contractPath: string }> {
        // First, try to resolve as static contract
        const resolution = resolvePlugin(projectRoot, pluginName, contractName);

        if (resolution.val && resolution.val.contractPath) {
            // Static contract - load from resolved path
            const contractPath = resolution.val.contractPath;
            const content = fs.readFileSync(contractPath).toString();
            const contractResult = parseContract(content, contractPath);
            return contractResult.map((contract) => ({ contract, contractPath }));
        }

        // Dynamic contract - try materialized location (agent-kit is the single source of truth)
        // Contract name format: "prefix/name" (e.g., "list/recipes-list")
        const materializedDir = path.join(projectRoot, 'agent-kit/materialized-contracts');

        // Convert plugin name to directory name (e.g., "@jay-framework/wix-data" -> "wix-data")
        const pluginDir = pluginName.startsWith('@')
            ? pluginName.split('/').pop() || pluginName
            : pluginName;

        // Convert contract name to filename (e.g., "list/recipes-list" -> "list-recipes-list.jay-contract")
        const contractFileName = contractName.replace(/\//g, '-') + '.jay-contract';
        const materializedPath = path.join(materializedDir, pluginDir, contractFileName);

        if (fs.existsSync(materializedPath)) {
            const content = fs.readFileSync(materializedPath).toString();
            const contractResult = parseContract(content, materializedPath);

            // Try to load metadata from plugins-index.yaml (in agent-kit/ root)
            let metadata: Record<string, unknown> | undefined;
            const indexPath = path.join(projectRoot, 'agent-kit', 'plugins-index.yaml');
            if (fs.existsSync(indexPath)) {
                try {
                    const indexContent = fs.readFileSync(indexPath, 'utf-8');
                    const index = YAML.parse(indexContent);
                    // Index stores short plugin name (e.g., "wix-data"), but pluginName might be
                    // the full npm package name (e.g., "@jay-framework/wix-data")
                    const plugin = index.plugins?.find(
                        (p: { name: string }) => p.name === pluginName || p.name === pluginDir,
                    );
                    const entry = plugin?.contracts?.find(
                        (c: { name: string }) => c.name === contractName,
                    );
                    metadata = entry?.metadata;
                } catch {
                    // Ignore errors reading index - metadata is optional
                }
            }

            return contractResult.map((contract) => ({
                contract,
                contractPath: materializedPath,
                metadata,
            }));
        }

        // Not found - return validation error
        return new WithValidations(null as any, [
            `Contract "${contractName}" not found for plugin "${pluginName}". ` +
                `For dynamic contracts, run 'jay-stack agent-kit' to materialize them first.`,
        ]);
    },
    resolvePluginManifest(
        pluginName: string,
        projectRoot: string,
    ): WithValidations<PluginManifest> {
        return resolvePluginManifest(projectRoot, pluginName);
    },
    readJayHtml(
        importingModuleDir: string,
        src: string,
    ): { content: string; componentDir: string; filePath: string } | null {
        const resolvedPath = src.startsWith('.') ? path.resolve(importingModuleDir, src) : src;
        // Try <src>.jay-html first (file-based convention)
        const jayHtmlPath = resolvedPath + '.jay-html';
        try {
            const content = fs.readFileSync(jayHtmlPath, 'utf-8');
            return { content, componentDir: path.dirname(jayHtmlPath), filePath: jayHtmlPath };
        } catch {
            // fall through
        }
        // Try <src>/<basename>.jay-html (directory-based convention)
        const dirJayHtmlPath =
            path.resolve(resolvedPath, path.basename(resolvedPath)) + '.jay-html';
        try {
            const content = fs.readFileSync(dirJayHtmlPath, 'utf-8');
            return {
                content,
                componentDir: path.dirname(dirJayHtmlPath),
                filePath: dirJayHtmlPath,
            };
        } catch {
            return null;
        }
    },
};

/**
 * Create a resolver bound to an {@link AnalysisContext} (DL#225). Owners (dev-server session, build run,
 * CLI command, test) create one — and typically one context — and thread it through `parseJayFile(…,
 * resolver, …)`. Defaults to a fresh private context when none is passed.
 */
export function createJayImportResolver(
    context: AnalysisContext = createAnalysisContext(),
): JayImportResolver {
    return {
        ...baseResolverMethods,
        analyzeExportedTypes: (fullPath, options) =>
            context.analyzeExportedTypes(fullPath, options),
    };
}

/**
 * Process-wide default context + resolver, for callers that don't yet thread their own (DL#225 keeps this as
 * a lazy default during the incremental migration). `clearExportedTypesCache` invalidates it — the dev
 * server calls it from its file watcher.
 */
const defaultAnalysisContext = createAnalysisContext();
export const JAY_IMPORT_RESOLVER: JayImportResolver =
    createJayImportResolver(defaultAnalysisContext);

/** Fully reset the default resolver's analysis state. */
export function clearExportedTypesCache(): void {
    defaultAnalysisContext.clear();
}

/**
 * Note a changed file on the default context (dev-server watcher). Bumps just that file's version so the
 * LanguageService re-reads it and re-checks dependents — incremental, keeping the rest of the program warm
 * (vs a full reset). A dev server is one process = one default context, so this stays naturally scoped.
 */
export function noteExportedTypesFileChanged(changedPath: string): void {
    defaultAnalysisContext.noteFileChanged(changedPath);
}
