import {
    checkValidationErrors,
    JayFile,
    parseJayFile,
    parseTypeScriptFile,
    WithValidations,
} from 'jay-compiler';
import { PluginContext } from 'rollup';
import { JayPluginContext } from './jay-plugin-context';
import { getSourceJayMetadata, JayFormat, JayMetadata } from './metadata';
import { getFileContext } from '../common/files';

export async function getJayFileStructure(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
): Promise<{ meta: JayMetadata; jayFile: JayFile }> {
    const meta = getSourceJayMetadata(context, id);
    const sourceJayFile = jayContext.getCachedJayFile(meta.originId);
    if (Boolean(sourceJayFile)) return { meta, jayFile: sourceJayFile };

    const jayFile = checkValidationErrors(await getJayFile(jayContext, meta, code));
    jayContext.cacheJayFile(meta.originId, jayFile);
    return { meta, jayFile };
}

async function getJayFile(
    jayContext: JayPluginContext,
    meta: JayMetadata,
    code: string,
): Promise<WithValidations<JayFile>> {
    const { originId: id, format } = meta;
    switch (format) {
        case JayFormat.JayHtml:
            return await getJayStructureFromJayHtmlSource(jayContext, code, id);
        case JayFormat.TypeScript:
            return await getJayStructureFromTypeScriptSource(code, id);
        default:
            throw new Error(`Unknown Jay format ${format}`);
    }
}

async function getJayStructureFromJayHtmlSource(
    jayContext: JayPluginContext,
    code: string,
    id: string,
): Promise<WithValidations<JayFile>> {
    const { filename, dirname } = getFileContext(id);
    return await parseJayFile(code, filename, dirname, {
        relativePath: jayContext.jayOptions.tsConfigFilePath,
    });
}

async function getJayStructureFromTypeScriptSource(
    code: string,
    id: string,
): Promise<WithValidations<JayFile>> {
    return await parseTypeScriptFile(id, code);
}
