import { generateElementFile } from 'jay-compiler';
import { LoadResult, PluginContext, ResolveIdResult, TransformResult } from 'rollup';
import { JayRollupConfig } from './types';
import {
    checkCodeErrors,
    checkValidationErrors,
    getFileContext,
    isJayFile,
    isJayTsFile,
    readFileWhenExists,
    writeGeneratedFile,
} from './helpers';
import path from 'node:path';
import { JAY_TS_EXTENSION, TS_EXTENSION } from './constants';
import { readFile } from 'node:fs/promises';

const TYPESCRIPT_EXTENSION = '.ts';
enum JayFormat {
    Html = 'html',
    Typescript = 'typescript',
}

export function jayRuntime(jayOptions: JayRollupConfig = {}) {
    const projectRoot = path.dirname(jayOptions.tsConfigFilePath ?? process.cwd());
    const outputDir = jayOptions.outputDir && path.join(projectRoot, jayOptions.outputDir);
    // const isWorker = Boolean(jayOptions.isWorker);

    return {
        name: 'jay:runtime', // this name will show up in warnings and errors
        enforce: 'pre',
        resolveId(source: string, importer: string | undefined): ResolveIdResult {
            if (!isJayFile(source)) return null;

            const context = this as PluginContext;
            const sourcePath = path.resolve(path.dirname(importer), source);
            const id = `${sourcePath}${TYPESCRIPT_EXTENSION}`;
            context.debug(`[resolveId] resolved ${id}`);
            return { id };
        },
        async load(id: string): Promise<LoadResult> {
            if (!isJayTsFile(id)) return null;

            const context = this as PluginContext;
            context.info(`[load] start ${id}`);
            const existingTsFileSource = await readFileWhenExists(id);
            if (existingTsFileSource) {
                return {
                    code: existingTsFileSource,
                    meta: { jay: { format: JayFormat.Typescript } },
                };
            }

            const sourcePath = id.slice(0, id.length - TYPESCRIPT_EXTENSION.length);
            const jayCode = (await readFile(sourcePath)).toString();
            checkCodeErrors(jayCode);
            context.info(`[load] end ${id}`);
            return { code: jayCode, meta: { jay: { format: JayFormat.Html } } };
        },
        async transform(code: string, id: string): Promise<TransformResult> {
            if (!isJayTsFile(id)) return null;

            const context = this as PluginContext;
            if (context.getModuleInfo(id).meta.jay?.format !== JayFormat.Html) return null;

            context.info(`[transform] start ${id}`);
            const { filename, dirname } = getFileContext(id, JAY_TS_EXTENSION);
            const tsCode = generateElementFile(code, filename, dirname);
            checkValidationErrors(tsCode.validations);
            await writeGeneratedFile(context, projectRoot, outputDir, id, tsCode.val);
            context.info(`[transform] end ${id}`);
            return { code: tsCode.val };
        },
    };
}
