import { LoadResult, PluginContext } from 'rollup';
import { getJayMetadata } from './metadata';
import { readFileAsString } from '../common/files';
import { checkCodeErrors } from '../common/errors';
import {TS_EXTENSION, TSX_EXTENSION} from "jay-compiler-shared";

function stripTSExtension(id: string) {
    return id.replace(TS_EXTENSION, '')
        .replace(TSX_EXTENSION, '');
}

export async function loadJayFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    let { originId } = getJayMetadata(context, id);
    if (!Boolean(originId))
        originId = stripTSExtension(id);

    const code = checkCodeErrors(await readFileAsString(originId));
    console.info(`[load] end ${id}`);
    return { code };
}

export async function loadContractFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    let { originId } = getJayMetadata(context, id);
    if (!Boolean(originId))
        originId = stripTSExtension(id);

    const code = await readFileAsString(originId);
    console.info(`[load] end ${id}`);
    return { code };
}