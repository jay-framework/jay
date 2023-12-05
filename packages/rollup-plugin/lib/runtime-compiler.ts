import { generateElementFile } from 'jay-compiler';
import { LoadResult, PluginContext, ResolveIdResult } from 'rollup';
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

export function jayRuntime(jayOptions: JayRollupConfig = {}) {
    const projectRoot = path.dirname(jayOptions.tsConfigFilePath ?? process.cwd());
    const outputDir = jayOptions.outputDir && path.join(projectRoot, jayOptions.outputDir);
    // const isWorker = Boolean(jayOptions.isWorker);

    return {
        name: 'jay:runtime', // this name will show up in warnings and errors
        enforce: 'pre',
        resolveId(
            source: string,
            importer: string | undefined,
            options: {
                attributes: Record<string, string>;
                custom?: { [plugin: string]: any };
                isEntry: boolean;
            },
        ): ResolveIdResult {
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
            const sourcePath = id.slice(0, id.length - TYPESCRIPT_EXTENSION.length);
            const { filename, dirname } = getFileContext(sourcePath, JAY_TS_EXTENSION);
            const existingTsFileSource = await readFileWhenExists(
                dirname,
                `${filename}${TS_EXTENSION}`,
            );
            if (existingTsFileSource) {
                return { code: existingTsFileSource };
            }

            const jayCode = (await readFile(sourcePath)).toString();
            checkCodeErrors(jayCode);
            const tsCode = generateElementFile(jayCode, filename, dirname);
            checkValidationErrors(tsCode.validations);
            await writeGeneratedFile(context, projectRoot, outputDir, id, tsCode.val);
            context.info(`[load] end ${id}`);
            return { code: tsCode.val };
        },
    };
}
