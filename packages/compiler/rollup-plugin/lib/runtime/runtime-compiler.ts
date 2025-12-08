import {
    hasExtension,
    hasJayExtension,
    hasJayModeExtension,
    Import,
    JAY_CONTRACT_EXTENSION,
    JAY_EXTENSION,
    TS_EXTENSION,
} from '@jay-framework/compiler-shared';
import { LoadResult, ResolveIdResult, TransformResult } from 'rollup';
import { SANDBOX_ROOT_PREFIX } from './sandbox';
import { transformJayFile } from './transform';
import {
    resolveJayHtml,
    removeSandboxPrefixForWorkerRoot,
    ResolveIdOptions,
    resolveJayModeFile,
    resolveJayContract,
    hasCssImportedByJayHtml,
    resolveCssFileImportedByJayHtml,
    isResolvedCssFile,
} from './resolve-id';
import { loadContractFile, loadCssFile, loadJayFile } from './load';
import { JayRollupConfig } from '../common/types';
import { JayPluginContext } from './jay-plugin-context';
import { ViteDevServer, UserConfig } from 'vite';

const GLOBAL_FUNC_REPOSITORY = 'GLOBAL_FUNC_REPOSITORY.ts';

export function jayRuntime(jayOptions: JayRollupConfig = {}, givenJayContext?: JayPluginContext) {
    const jayContext = givenJayContext || new JayPluginContext(jayOptions);
    let server: ViteDevServer;
    let isVite: boolean = false;
    let config: UserConfig;
    return {
        name: 'jay:runtime',
        configResolved(_config) {
            config = _config;
            isVite = true;
        },
        buildStart(opts) {
            // Vite adds additional properties to the plugin context
            isVite =
                isVite ||
                Boolean(
                    opts.plugins?.some(
                        (plugin) =>
                            plugin.name === 'vite:build-metadata' ||
                            plugin.name?.startsWith('vite:'),
                    ),
                );

            console.log('[buildStart] Vite detected:', isVite);
        },
        configureServer(_server: ViteDevServer) {
            server = _server;
        },
        async resolveId(
            source: string,
            importer: string | undefined,
            options: ResolveIdOptions,
        ): Promise<ResolveIdResult> {
            // Use hasJayExtension to handle query params like ?jay-client
            if (hasJayExtension(source, JAY_EXTENSION)) {
                return await resolveJayHtml(
                    this,
                    source,
                    importer,
                    options,
                    config?.root,
                    jayOptions.generationTarget,
                );
            }
            if (hasJayExtension(source, JAY_CONTRACT_EXTENSION))
                return await resolveJayContract(this, source, importer, options, config?.root);
            if (hasJayModeExtension(source))
                return await resolveJayModeFile(this, source, importer, options);
            if (hasCssImportedByJayHtml(source, importer)) {
                return resolveCssFileImportedByJayHtml(this, importer, config?.root);
            }
            if (
                source.includes(SANDBOX_ROOT_PREFIX) ||
                (jayOptions.isWorker && importer === undefined)
            )
                return await removeSandboxPrefixForWorkerRoot(this, source, importer, options);
            if (source === Import.functionRepository.module)
                return Promise.resolve(GLOBAL_FUNC_REPOSITORY);
            return null;
        },
        async load(id: string): Promise<LoadResult> {
            // Use hasJayExtension to handle query params like ?jay-client
            if (
                hasJayExtension(id, JAY_EXTENSION, { withTs: true }) ||
                hasJayModeExtension(id, { withTs: true })
            ) {
                return await loadJayFile(this, id);
            } else if (hasJayExtension(id, JAY_CONTRACT_EXTENSION, { withTs: true })) {
                return await loadContractFile(this, id);
            } else if (isResolvedCssFile(id)) {
                return await loadCssFile(this, jayContext, id, isVite);
            } else if (id === GLOBAL_FUNC_REPOSITORY) {
                const { functionRepository } =
                    jayContext.globalFunctionsRepository.generateGlobalFile();
                return functionRepository;
            }
            return null;
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            // Use hasJayExtension to handle query params like ?jay-client
            if (
                hasJayExtension(id, JAY_EXTENSION, { withTs: true }) ||
                hasJayModeExtension(id, { withTs: true })
            )
                return await transformJayFile(jayContext, this, code, id);
            // Contract files are now compiled in the load hook to avoid esbuild issues
            // No transform needed here
            return null;
        },
        watchChange(id: string, change: { event: 'create' | 'update' | 'delete' }): void {
            console.log(`[watchChange] ${id} ${change.event}`);
            jayContext.deleteCachedJayFile(id);
            if (server) {
                const module = server.moduleGraph.getModuleById(id + TS_EXTENSION);
                if (module) {
                    server.moduleGraph.invalidateModule(module);
                    server.ws.send({
                        type: 'full-reload',
                    });
                }
            }
        },
    };
}
