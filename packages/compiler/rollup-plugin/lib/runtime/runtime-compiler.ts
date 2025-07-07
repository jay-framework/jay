import {
    hasExtension,
    hasJayModeExtension,
    Import,
    JAY_CONTRACT_EXTENSION,
    JAY_EXTENSION, TS_EXTENSION,
} from '@jay-framework/compiler-shared';
import { LoadResult, PluginContext, ResolveIdResult, TransformResult } from 'rollup';
import { SANDBOX_ROOT_PREFIX } from './sandbox';
import { transformJayFile } from './transform';
import {
    resolveJayHtml,
    removeSandboxPrefixForWorkerRoot,
    ResolveIdOptions,
    resolveJayModeFile,
    resolveJayContract,
} from './resolve-id';
import { loadContractFile, loadJayFile } from './load';
import { JayRollupConfig } from '../common/types';
import { JayPluginContext } from './jay-plugin-context';
import { getFileContext, readFileAsString } from '../common/files';
import { checkCodeErrors } from '../common/errors';
import {
    compileContract,
    JAY_IMPORT_RESOLVER,
    parseContract,
} from '@jay-framework/compiler-jay-html';
import {ViteDevServer} from "vite";

const GLOBAL_FUNC_REPOSITORY = 'GLOBAL_FUNC_REPOSITORY.ts';

export function jayRuntime(jayOptions: JayRollupConfig = {}, givenJayContext?: JayPluginContext) {
    const jayContext = givenJayContext || new JayPluginContext(jayOptions);
    let server: ViteDevServer
    return {
        name: 'jay:runtime',
        configureServer(_server: ViteDevServer) {
            server = _server;
        },
        async resolveId(
            source: string,
            importer: string | undefined,
            options: ResolveIdOptions,
        ): Promise<ResolveIdResult> {
            if (hasExtension(source, JAY_EXTENSION))
                return await resolveJayHtml(
                    this,
                    source,
                    importer,
                    options,
                    jayOptions.generationTarget,
                );
            if (hasExtension(source, JAY_CONTRACT_EXTENSION))
                return await resolveJayContract(this, source, importer, options);
            if (hasJayModeExtension(source))
                return await resolveJayModeFile(this, source, importer, options);
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
            if (
                hasExtension(id, JAY_EXTENSION, { withTs: true }) ||
                hasJayModeExtension(id, { withTs: true })
            )
                return await loadJayFile(this, id);
            else if (hasExtension(id, JAY_CONTRACT_EXTENSION, { withTs: true })) {
                return await loadContractFile(this, id);
            } else if (id === GLOBAL_FUNC_REPOSITORY) {
                const { functionRepository } =
                    jayContext.globalFunctionsRepository.generateGlobalFile();
                return functionRepository;
            }
            return null;
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            if (
                hasExtension(id, JAY_EXTENSION, { withTs: true }) ||
                hasJayModeExtension(id, { withTs: true })
            )
                return await transformJayFile(jayContext, this, code, id);
            else if (hasExtension(id, JAY_CONTRACT_EXTENSION, { withTs: true })) {
                const { filename, dirname } = getFileContext(id, JAY_CONTRACT_EXTENSION);

                const parsedFile = parseContract(code, filename);
                const tsCode = await compileContract(
                    parsedFile,
                    `${dirname}/${filename}`,
                    JAY_IMPORT_RESOLVER,
                );
                if (tsCode.val)
                    return Promise.resolve({
                        code: tsCode.val,
                    });
                else return Promise.reject(tsCode.validations);
            }
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
                        type: 'full-reload'
                    });                }
            }
        },
    };
}
