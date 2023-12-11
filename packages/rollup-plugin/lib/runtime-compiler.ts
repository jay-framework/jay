import {
    componentBridgeTransformer,
    generateElementFile,
    getJayTsFileSourcePath,
    getModeFromExtension,
    hasExtension,
    hasJayModeExtension,
    parseJayFile,
    RuntimeMode,
    JAY_EXTENSION,
    JAY_TS_EXTENSION,
    withoutExtension,
    TS_EXTENSION,
} from 'jay-compiler';
import { LoadResult, PluginContext, ResolveIdResult, TransformResult } from 'rollup';
import { JayRollupConfig } from './types';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import * as ts from 'typescript';
import { transform } from 'typescript';
import { JayPluginContext } from './jay-plugin-context.ts';
import {
    getFileContext,
    readFileAsString,
    readFileWhenExists,
    writeGeneratedFile,
} from './files.ts';
import { checkCodeErrors, checkDiagnosticsErrors, checkValidationErrors } from './errors.ts';

const TYPESCRIPT_EXTENSION = '.ts';
enum JayFormat {
    Html = 'html',
    Typescript = 'typescript',
}

export function jayRuntime(jayOptions: JayRollupConfig = {}) {
    const jayContext = new JayPluginContext(jayOptions);

    return {
        name: 'jay:runtime', // this name will show up in warnings and errors
        resolveId(source: string, importer: string | undefined): ResolveIdResult {
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
            return null;
        },
    };
}

function resolveIdForJayFile(
    context: PluginContext,
    source: string,
    importer: string,
): ResolveIdResult {
    const sourcePath = path.resolve(path.dirname(importer), source);
    const id = `${sourcePath}${TYPESCRIPT_EXTENSION}`;
    context.debug(`[resolveId] resolved ${id}`);
    return { id };
}

async function loadJayHtmlFile(
    context: PluginContext,
    id: string,
    customSourcePath?: string,
): Promise<LoadResult> {
    context.debug(`[load] start ${id}`);
    const existingTsFileSource = await readFileWhenExists(id);
    if (existingTsFileSource) {
        return {
            code: existingTsFileSource,
            meta: { jay: { format: JayFormat.Typescript } },
        };
    }

    const sourcePath = customSourcePath || withoutExtension(id, TS_EXTENSION);
    const jayCode = (await readFile(sourcePath)).toString();
    checkCodeErrors(jayCode);
    context.debug(`[load] end ${id}`);
    return { code: jayCode, meta: { jay: { format: JayFormat.Html } } };
}

async function loadJayTsFile(
    context: PluginContext,
    id: string,
    sourcePath: string,
): Promise<LoadResult> {
    context.debug(`[load] start ${id}`);
    const code = await readFileAsString(sourcePath);
    context.debug(`[load] end ${id}`);
    return { code };
}

async function transformJayHtmlFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    jayHtmlCode: string,
    id: string,
    customSourcePath?: string,
): Promise<LoadResult> {
    if (context.getModuleInfo(id).meta.jay?.format !== JayFormat.Html) return null;

    context.debug(`[transform] start ${id}`);
    checkCodeErrors(jayHtmlCode);
    const { filename, dirname } = getFileContext(customSourcePath || id, JAY_TS_EXTENSION);
    const parsedFile = parseJayFile(jayHtmlCode, filename, dirname);
    const mode = jayContext.isWorker ? RuntimeMode.SandboxWorker : getModeFromExtension(id);
    const tsCode = generateElementFile(parsedFile, mode);
    checkValidationErrors(tsCode.validations);
    await writeGeneratedFile(jayContext, context, id, tsCode.val);

    context.debug(`[transform] end ${mode} ${id}`);
    return { code: tsCode.val };
}

async function transformJayTsFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
): Promise<LoadResult> {
    const mode = getModeFromExtension(id);
    context.debug(`[transform] start ${mode} ${id}`);
    if (mode === RuntimeMode.Trusted || !code.includes('makeJayComponent')) {
        await writeGeneratedFile(jayContext, context, id, code);
        context.debug(`[transform] end ${mode} ${id}`);
        return { code: code };
    }

    const tsSource = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const tsCode = transform(tsSource, [componentBridgeTransformer(mode)]);
    checkDiagnosticsErrors(tsCode);
    const outputCode = jayContext.tsPrinter.printNode(
        ts.EmitHint.Unspecified,
        tsCode.transformed[0],
        tsSource,
    );
    await writeGeneratedFile(jayContext, context, id, outputCode);
    context.debug(`[transform] end ${mode} ${id}`);
    return { code: outputCode };
}
