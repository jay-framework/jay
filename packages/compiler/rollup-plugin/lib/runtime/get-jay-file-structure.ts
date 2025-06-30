import { parseGenericTypescriptFile } from '@jay-framework/compiler';
import { PluginContext } from 'rollup';
import { JayPluginContext } from './jay-plugin-context';
import { getSourceJayMetadata, JayMetadata } from './metadata';
import { getFileContext } from '../common/files';
import {
    checkValidationErrors,
    CompilerSourceFile,
    SourceFileFormat,
    WithValidations,
} from '@jay-framework/compiler-shared';
import { JAY_IMPORT_RESOLVER, parseJayFile } from '@jay-framework/compiler-jay-html';

export async function getJayFileStructure(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
): Promise<{ meta: JayMetadata; jayFile: CompilerSourceFile }> {
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
): Promise<WithValidations<CompilerSourceFile>> {
    const { originId: id, format } = meta;
    switch (format) {
        case SourceFileFormat.JayHtml:
            return await getJayStructureFromJayHtmlSource(jayContext, code, id);
        case SourceFileFormat.TypeScript:
            return await getJayStructureFromTypeScriptSource(code, id);
        default:
            throw new Error(`Unknown Jay format ${format}`);
    }
}

async function getJayStructureFromJayHtmlSource(
    jayContext: JayPluginContext,
    code: string,
    id: string,
): Promise<WithValidations<CompilerSourceFile>> {
    const { filename, dirname } = getFileContext(id);
    return await parseJayFile(
        code,
        filename,
        dirname,
        {
            relativePath: jayContext.jayOptions.tsConfigFilePath,
        },
        JAY_IMPORT_RESOLVER,
    );
}

async function getJayStructureFromTypeScriptSource(
    code: string,
    id: string,
): Promise<WithValidations<CompilerSourceFile>> {
    return await parseGenericTypescriptFile(id, code);
}
