import { CustomPluginOptions, PluginContext, ResolvedId, ResolveIdResult } from 'rollup';
import { watchChangesFor } from './watch';
import { SANDBOX_ROOT_PREFIX } from './sandbox';
import { appendJayMetadata, jayMetadataFromModuleMetadata } from './metadata';
import {
    CSS_EXTENSION,
    GenerateTarget,
    hasExtension,
    JAY_EXTENSION,
    JAY_QUERY_MAIN_SANDBOX,
    JAY_QUERY_WORKER_TRUSTED_TS,
    SourceFileFormat,
    TS_EXTENSION,
    TSX_EXTENSION,
} from '@jay-framework/compiler-shared';
import { stripTSExtension } from './load';

const JAY_HTML_CSS = '.css';

export interface ResolveIdOptions {
    attributes: Record<string, string>;
    custom?: CustomPluginOptions;
    isEntry: boolean;
    skipSelf?: boolean;
}

export async function resolveJayHtml(
    context: PluginContext,
    source: string,
    importer: string | undefined,
    options: ResolveIdOptions,
    root: string,
    generationTarget: GenerateTarget = GenerateTarget.jay,
): Promise<ResolveIdResult> {
    const resolved = await context.resolve(source, importer, { ...options, skipSelf: true });
    if (
        !resolved ||
        hasExtension(resolved.id, TS_EXTENSION) ||
        hasExtension(resolved.id, TSX_EXTENSION)
    )
        return null;

    const resolvedJayMeta = jayMetadataFromModuleMetadata(resolved.id, resolved.meta);
    const extension = generationTarget === GenerateTarget.react ? TSX_EXTENSION : TS_EXTENSION;

    let format: SourceFileFormat, originId: string;
    if (resolvedJayMeta.originId) {
        format = resolvedJayMeta.format;
        originId = resolvedJayMeta.originId;
    } else {
        watchChangesFor(context, resolved.id);
        format = SourceFileFormat.JayHtml;
        originId = resolved.id;
    }

    const id =
        context['ssr'] && originId.startsWith(root)
            ? `${originId}${extension}`.slice(root.length)
            : `${originId}${extension}`;

    console.info(`[resolveId] resolved ${id} as ${format}`);
    return { id, meta: appendJayMetadata(context, id, { format, originId }) };
}

export async function resolveJayContract(
    context: PluginContext,
    source: string,
    importer: string | undefined,
    options: ResolveIdOptions,
) {
    const resolved = await context.resolve(source, importer, { ...options, skipSelf: true });
    const id = `${resolved.id}${TS_EXTENSION}`;
    console.info(`[resolveId] resolved ${id}`);
    return {
        id,
        meta: appendJayMetadata(context, id, {
            format: SourceFileFormat.JayContract,
            originId: resolved.id,
        }),
    };
}

export async function resolveJayModeFile(
    context: PluginContext,
    source: string,
    importer: string | undefined,
    options: ResolveIdOptions,
): Promise<ResolveIdResult> {
    const idParts = source.split('?');
    const idWithoutJayModeExtension = idParts.slice(0, -1).join('?');
    const mode = idParts.slice(-1)[0];
    const resolved = await context.resolve(idWithoutJayModeExtension, importer, {
        ...options,
        skipSelf: false,
    });
    if (!resolved) return null;

    const resolvedJayMeta = jayMetadataFromModuleMetadata(resolved.id, resolved.meta);
    const format = resolvedJayMeta.format || SourceFileFormat.TypeScript;
    const originId = resolvedJayMeta.originId || resolved.id;
    const id = getResolvedId(resolved, mode, originId);
    console.info(`[resolveId] resolved ${id} as ${format}`);
    return { id, meta: appendJayMetadata(context, id, { format, originId }, resolvedJayMeta) };
}

export async function removeSandboxPrefixForWorkerRoot(
    context: PluginContext,
    source: string,
    importer: string,
    options: ResolveIdOptions,
): Promise<ResolveIdResult> {
    const sourceWithoutPrefix = source.replace(SANDBOX_ROOT_PREFIX, '');
    const resolved = await context.resolve(sourceWithoutPrefix, importer, {
        ...options,
        skipSelf: true,
    });
    if (!resolved) return null;

    const id = `${resolved.id}${JAY_QUERY_WORKER_TRUSTED_TS}`;
    const originId = id.split('?')[0];
    console.info(`[resolveId] resolved sandbox root ${id}`);
    return {
        id,
        meta: appendJayMetadata(context, id, {
            originId,
            format: SourceFileFormat.TypeScript,
            isWorkerRoot: true,
        }),
    };
}

function getResolvedId(resolved: ResolvedId, mode: string, originId: string): string {
    const extension = resolved.id.split('.').pop();
    const id = `${originId}?${mode}.${extension}`;
    return id;
}

export function hasCssImportedByJayHtml(source: string, importer: string | undefined) {
    return (
        hasExtension(source, CSS_EXTENSION) &&
        importer &&
        (hasExtension(importer, JAY_EXTENSION, { withTs: true }) ||
            hasExtension(importer, JAY_EXTENSION + JAY_QUERY_MAIN_SANDBOX, { withTs: true }))
    );
}

export function resolveCssFile(context: PluginContext, importer: string) {
    const originImporter = importer.split('?')[0];
    const originId = stripTSExtension(originImporter);
    const id = `${originId}${JAY_HTML_CSS}`;
    return {
        id,
        meta: appendJayMetadata(context, id, {
            format: SourceFileFormat.CSS,
            originId: originId,
        }),
    };
}

export function isResolvedCssFile(id: string) {
    return id.endsWith(JAY_HTML_CSS) && id.indexOf(JAY_EXTENSION) > 0;
}
