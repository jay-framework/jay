import {
    getJayTsFileSourcePath,
    getModeFromExtension,
    hasExtension,
    hasJayModeExtension,
    JAY_EXTENSION,
    JAY_TS_EXTENSION,
    parseJayFile,
    RuntimeMode,
    TS_EXTENSION,
    withoutExtension,
} from 'jay-compiler';
import {
    CustomPluginOptions,
    LoadResult,
    PluginContext,
    ResolveIdResult,
    TransformResult,
} from 'rollup';
import { JayRollupConfig } from '../common/types';
import path from 'node:path';
import { JayPluginContext } from './jay-plugin-context';
import {
    getFileContext,
    readFileAsString,
    readFileWhenExists,
    writeGeneratedFile,
} from '../common/files';
import { checkCodeErrors } from '../common/errors';
import { appendJayMetadata, getJayMetadata, isWorkerRoot, JayFormat } from './metadata';
import { watchChangesFor } from './watch';
import { transformJayHtmlParsedFile, transformJayTsCode } from './transform-ts-code';
import { generateImportsFileFromTsSource } from '../../../compiler/lib/ts-file/generate-imports-file';
import { SANDBOX_ROOT_PREFIX } from './sandbox.ts';

interface ResolveIdOptions {
    attributes: Record<string, string>;
    custom?: CustomPluginOptions;
    isEntry: boolean;
}

export function jayRuntime(jayOptions: JayRollupConfig = {}) {
    const jayContext = new JayPluginContext(jayOptions);

    return {
        name: 'jay:runtime', // this name will show up in warnings and errors
        async resolveId(
            source: string,
            importer: string | undefined,
            options: ResolveIdOptions,
        ): Promise<ResolveIdResult> {
            if (
                source.includes(SANDBOX_ROOT_PREFIX) ||
                (jayOptions.isWorker && importer === undefined)
            )
                return resolveIdForWorkerRootFile(this, source, importer, options);
            if (hasExtension(source, JAY_EXTENSION) || hasJayModeExtension(source))
                return resolveIdForJayFile(this, source, importer);
            return null;
        },
        async load(id: string): Promise<LoadResult> {
            if (hasExtension(id, JAY_EXTENSION, { withTs: true }))
                return await loadJayHtmlFile(this, id);
            if (hasJayModeExtension(id, { withTs: true })) {
                const sourcePath = getJayTsFileSourcePath(id);
                if (hasExtension(sourcePath, JAY_EXTENSION, { withTs: true }))
                    return await loadJayHtmlFile(
                        this,
                        id,
                        withoutExtension(sourcePath, TS_EXTENSION),
                    );
                return await loadJayTsFile(this, id, sourcePath);
            }
            return null;
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            if (hasExtension(id, JAY_EXTENSION, { withTs: true }))
                return await transformJayHtmlFile(jayContext, this, code, id);
            if (hasJayModeExtension(id, { withTs: true })) {
                const sourcePath = getJayTsFileSourcePath(id);
                if (hasExtension(sourcePath, JAY_EXTENSION, { withTs: true }))
                    return await transformJayHtmlFile(jayContext, this, code, id, sourcePath);
                return await transformJayTsFile(jayContext, this, code, id);
            }
            if (isWorkerRoot(this, id)) return transformWorkerRootFile(jayContext, this, code, id);
            return null;
        },
    };
}

async function resolveIdForWorkerRootFile(
    context: PluginContext,
    source: string,
    importer: string,
    options: ResolveIdOptions,
): Promise<ResolveIdResult> {
    watchChangesFor(context, source);
    const sourceWithoutPrefix = source.replace(SANDBOX_ROOT_PREFIX, '');
    const resolved = await context.resolve(sourceWithoutPrefix, importer, {
        ...options,
        skipSelf: true,
    });
    if (!resolved) return null;
    const id = resolved.id;
    console.info(`[resolveId] resolved sandbox root ${id}`);
    return {
        id,
        meta: appendJayMetadata(context, id, { originalId: source, isWorkerRoot: true }),
    };
}

function resolveIdForJayFile(
    context: PluginContext,
    source: string,
    importer: string,
): ResolveIdResult {
    const sourcePath = importer ? path.resolve(path.dirname(importer), source) : source;
    watchChangesFor(context, sourcePath);
    const id = `${sourcePath}${TS_EXTENSION}`;
    console.info(`[resolveId] resolved ${id}`);
    return {
        id,
        meta: appendJayMetadata(context, id, {
            originalId: sourcePath,
            isWorkerRoot: getJayMetadata(context, importer).isWorkerRoot,
        }),
    };
}

async function loadJayHtmlFile(
    context: PluginContext,
    id: string,
    customSourcePath?: string,
): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    const existingTsFileSource = await readFileWhenExists(id);
    if (existingTsFileSource) {
        return {
            code: existingTsFileSource,
            meta: appendJayMetadata(context, id, { format: JayFormat.Typescript, originalId: id }),
        };
    }

    const sourcePath = customSourcePath || withoutExtension(id, TS_EXTENSION);
    const jayCode = await readFileAsString(sourcePath);
    checkCodeErrors(jayCode);
    console.info(`[load] end ${id}`);
    return {
        code: jayCode,
        meta: appendJayMetadata(context, id, { format: JayFormat.Html, originalId: sourcePath }),
    };
}

async function loadJayTsFile(
    context: PluginContext,
    id: string,
    sourcePath: string,
): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    const code = await readFileAsString(sourcePath);
    console.info(`[load] end ${id}`);
    return {
        code,
        meta: appendJayMetadata(context, id, { format: JayFormat.Html, originalId: sourcePath }),
    };
}

async function transformJayHtmlFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    jayHtmlCode: string,
    id: string,
    customSourcePath?: string,
): Promise<TransformResult> {
    if (getJayMetadata(context, id).format !== JayFormat.Html) return null;

    console.info(`[transform] start ${id}`);
    checkCodeErrors(jayHtmlCode);
    const { filename, dirname } = getFileContext(customSourcePath || id, JAY_TS_EXTENSION);
    const parsedFile = parseJayFile(jayHtmlCode, filename, dirname);
    const mode = getModeFromExtension(id);
    const tsCode = transformJayHtmlParsedFile(mode, parsedFile);
    await writeGeneratedFile(jayContext, context, id, tsCode);

    console.info(`[transform] end ${mode} ${id}`);
    return { code: tsCode };
}

async function transformJayTsFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
): Promise<TransformResult> {
    const mode = getModeFromExtension(id);
    console.info(`[transform] start ${mode} ${id}`);
    const outputCode = transformJayTsCode(jayContext, mode, id, code);
    await writeGeneratedFile(jayContext, context, id, outputCode);
    console.info(`[transform] end ${mode} ${id}`);
    return { code: outputCode };
}

async function transformWorkerRootFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
): Promise<TransformResult> {
    const mode = RuntimeMode.WorkerTrusted;
    console.info(`[transform] start ${mode} ${id}`);

    const outputCode = generateImportsFileFromTsSource(id, code);
    await writeGeneratedFile(jayContext, context, id, outputCode);
    console.info(`[transform] end ${mode} ${id}`);
    return { code: outputCode };
}
