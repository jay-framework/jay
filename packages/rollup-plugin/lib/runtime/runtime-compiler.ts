import { hasExtension, hasJayModeExtension, JAY_EXTENSION } from 'jay-compiler';
import { LoadResult, ResolveIdResult, TransformResult } from 'rollup';
import { SANDBOX_ROOT_PREFIX } from './sandbox';
import { transformJayFile } from './transform';
import {
    addTsExtensionForJayFile,
    removeSandboxPrefixForWorkerRoot,
    ResolveIdOptions,
    resolveJayModeFile,
} from './resolve-id';
import { loadJayFile } from './load';
import { JayRollupConfig } from '../common/types';
import { JayPluginContext } from './jay-plugin-context';

export function jayRuntime(jayOptions: JayRollupConfig = {}, givenJayContext?: JayPluginContext) {
    const jayContext = givenJayContext || new JayPluginContext(jayOptions);

    return {
        name: 'jay:runtime', // this name will show up in warnings and errors
        async resolveId(
            source: string,
            importer: string | undefined,
            options: ResolveIdOptions,
        ): Promise<ResolveIdResult> {
            if (hasExtension(source, JAY_EXTENSION))
                return await addTsExtensionForJayFile(this, source, importer, options);
            if (hasJayModeExtension(source))
                return await resolveJayModeFile(this, source, importer, options);
            if (
                source.includes(SANDBOX_ROOT_PREFIX) ||
                (jayOptions.isWorker && importer === undefined)
            )
                return await removeSandboxPrefixForWorkerRoot(this, source, importer, options);
            return null;
        },
        async load(id: string): Promise<LoadResult> {
            if (
                hasExtension(id, JAY_EXTENSION, { withTs: true }) ||
                hasJayModeExtension(id, { withTs: true })
            )
                return await loadJayFile(this, id);
            return null;
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            if (
                hasExtension(id, JAY_EXTENSION, { withTs: true }) ||
                hasJayModeExtension(id, { withTs: true })
            )
                return await transformJayFile(jayContext, this, code, id);
            return null;
        },
        watchChange(id: string, change: { event: 'create' | 'update' | 'delete' }): void {
            console.log(`[watchChange] ${id} ${change.event}`);
            jayContext.deleteCachedJayFile(id);
        },
    };
}
