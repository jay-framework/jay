import { LoadResult, PluginContext } from 'rollup';
import { getJayMetadata } from './metadata';
import { getFileContext, readFileAsString } from '../common/files';
import { checkCodeErrors } from '../common/errors';
import {
    getBasePath,
    JAY_CONTRACT_EXTENSION,
    TS_EXTENSION,
    TSX_EXTENSION,
} from '@jay-framework/compiler-shared';
import {
    compileContract,
    JAY_IMPORT_RESOLVER,
    parseContract,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import path from 'node:path';
import { JayPluginContext } from './jay-plugin-context';

export function stripTSExtension(id: string) {
    // First get the base path without query parameters
    const basePath = getBasePath(id);
    // Then strip .ts/.tsx extension
    return basePath.replace(TS_EXTENSION, '').replace(TSX_EXTENSION, '');
}

export async function loadJayFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    const metadata = getJayMetadata(context, id);
    let originId = metadata.originId;
    console.info(`[load] metadata for ${id}:`, JSON.stringify(metadata));
    if (!Boolean(originId)) {
        originId = stripTSExtension(id);
        console.info(`[load] using stripTSExtension fallback: ${originId}`);
    }

    console.info(`[load] reading file from: ${originId}`);
    const code = checkCodeErrors(await readFileAsString(originId));
    console.info(`[load] end ${id}, code length: ${code.length}`);
    return { code };
}

export async function loadContractFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    let { originId } = getJayMetadata(context, id);
    if (!Boolean(originId)) originId = stripTSExtension(id);

    // Load the raw YAML content
    const yamlCode = await readFileAsString(originId);

    // Compile the contract YAML to TypeScript in the load hook
    // This ensures esbuild sees valid TypeScript, not YAML
    const { filename, dirname } = getFileContext(id, JAY_CONTRACT_EXTENSION);
    const parsedFile = parseContract(yamlCode, filename);
    const tsCode = await compileContract(parsedFile, `${dirname}/${filename}`, JAY_IMPORT_RESOLVER);

    if (!tsCode.val) {
        throw new Error(`Failed to compile contract ${id}: ${JSON.stringify(tsCode.validations)}`);
    }

    console.info(`[load] end ${id}`);
    return { code: tsCode.val };
}

export async function loadCssFile(
    context: PluginContext,
    jayContext: JayPluginContext,
    id: string,
    isVite: boolean,
): Promise<LoadResult> {
    if (isVite) {
        console.info(`[load] start ${id}`);
        const { originId } = getJayMetadata(context, id);
        const code = checkCodeErrors(await readFileAsString(originId));
        const fileName = path.basename(originId);
        const dirName = path.dirname(originId);
        const jayHtml = await parseJayFile(
            code,
            fileName,
            dirName,
            {
                relativePath: jayContext.jayOptions.tsConfigFilePath,
            },
            JAY_IMPORT_RESOLVER,
        );
        console.info(`[load] end ${id}`);
        return { code: jayHtml.val.css };
    } else {
        console.info(`[load] rollup environment - css not supported - ignoring css ${id}`);
        return { code: '' };
    }
}
