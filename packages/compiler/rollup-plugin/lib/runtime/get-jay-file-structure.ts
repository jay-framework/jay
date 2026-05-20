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
import fs from 'node:fs/promises';
import path from 'node:path';

const JAY_CACHE_TAG_START = '<script type="application/jay-cache">';
const JAY_DATA_MARKER = 'type="application/jay-data"';
const JAY_DATA_SCRIPT_RE = /<script\s+type="application\/jay-data">[\s\S]*?<\/script>/i;

/** Read `sourcePath` from a DL#110 pre-rendered jay-cache tag. */
function extractJayCacheSourcePath(html: string): string | undefined {
    const startIdx = html.indexOf(JAY_CACHE_TAG_START);
    if (startIdx === -1) return undefined;
    const jsonStart = startIdx + JAY_CACHE_TAG_START.length;
    const endIdx = html.indexOf('</script>', jsonStart);
    if (endIdx === -1) return undefined;
    try {
        const metadata = JSON.parse(html.substring(jsonStart, endIdx)) as { sourcePath?: string };
        return typeof metadata.sourcePath === 'string' ? metadata.sourcePath : undefined;
    } catch {
        return undefined;
    }
}

/** Inject the source file's `<script type="application/jay-data">` into pre-rendered HTML. */
function injectJayDataScript(preRenderedHtml: string, jayDataScript: string): string {
    const headMatch = preRenderedHtml.match(/<head[^>]*>/i);
    if (!headMatch || headMatch.index === undefined) {
        return `${jayDataScript}\n${preRenderedHtml}`;
    }
    const insertPos = headMatch.index + headMatch[0].length;
    return (
        preRenderedHtml.substring(0, insertPos) +
        '\n' +
        jayDataScript +
        preRenderedHtml.substring(insertPos)
    );
}

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
    // For pre-rendered files, resolve headfull FS paths from the original source directory
    const sourceDir = jayContext.resolveSourceDir(id);
    const parseOptions = {
        relativePath: jayContext.jayOptions.tsConfigFilePath,
    };
    const fsSourceDir = sourceDir !== dirname ? sourceDir : undefined;

    // DL#110: pre-rendered jay-html bakes the body but omits jay-data. Hydration still
    // needs the data schema — load it from sourcePath embedded in the jay-cache tag.
    const cacheSourcePath = extractJayCacheSourcePath(code);
    if (cacheSourcePath && !code.includes(JAY_DATA_MARKER)) {
        try {
            const sourceHtml = await fs.readFile(cacheSourcePath, 'utf-8');
            const jayDataMatch = sourceHtml.match(JAY_DATA_SCRIPT_RE);
            if (jayDataMatch) {
                const mergedHtml = injectJayDataScript(code, jayDataMatch[0]);
                const sourceFileDir = path.dirname(cacheSourcePath);
                return await parseJayFile(
                    mergedHtml,
                    filename,
                    dirname,
                    parseOptions,
                    JAY_IMPORT_RESOLVER,
                    jayContext.projectRoot,
                    fsSourceDir ?? sourceFileDir,
                );
            }
        } catch {
            // Fall through to default parse (surfaces a clear validation error).
        }
    }

    return await parseJayFile(
        code,
        filename,
        dirname,
        parseOptions,
        JAY_IMPORT_RESOLVER,
        jayContext.projectRoot,
        fsSourceDir,
    );
}

async function getJayStructureFromTypeScriptSource(
    code: string,
    id: string,
): Promise<WithValidations<CompilerSourceFile>> {
    return await parseGenericTypescriptFile(id, code);
}
