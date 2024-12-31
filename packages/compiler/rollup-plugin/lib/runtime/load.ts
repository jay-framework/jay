import { LoadResult, PluginContext } from 'rollup';
import { getJayMetadata } from './metadata';
import { readFileAsString } from '../common/files';
import { checkCodeErrors } from '../common/errors';

export async function loadJayFile(context: PluginContext, id: string): Promise<LoadResult> {
    console.info(`[load] start ${id}`);
    const { originId } = getJayMetadata(context, id);
    if (!Boolean(originId)) return null;

    const code = checkCodeErrors(await readFileAsString(originId));
    console.info(`[load] end ${id}`);
    return { code };
}
