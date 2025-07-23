import { LoadResult, PluginContext } from 'rollup';
import { getJayMetadata } from './metadata';
import { readFileAsString } from '../common/files';
import { checkCodeErrors } from '../common/errors';
import { TS_EXTENSION, TSX_EXTENSION } from '@jay-framework/compiler-shared';
import { JAY_IMPORT_RESOLVER, parseJayFile } from '@jay-framework/compiler-jay-html';
import path from 'node:path';
import { JayPluginContext } from './jay-plugin-context';

export function stripTSExtension(id: string) {
    return id.replace(TS_EXTENSION, '').replace(TSX_EXTENSION, '');
}

export async function loadJayFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    let { originId } = getJayMetadata(context, id);
    if (!Boolean(originId)) originId = stripTSExtension(id);

    const code = checkCodeErrors(await readFileAsString(originId));
    console.info(`[load] end ${id}`);
    return { code };
}

export async function loadContractFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    let { originId } = getJayMetadata(context, id);
    if (!Boolean(originId)) originId = stripTSExtension(id);

    const code = await readFileAsString(originId);
    console.info(`[load] end ${id}`);
    return { code };
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
